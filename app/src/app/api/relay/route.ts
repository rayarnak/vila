import { NextRequest, NextResponse } from "next/server";
import { isInSubset, getSubsetTreeInfo } from "@/lib/subsetTree";

const RELAYER_URL =
  process.env.RELAYER_URL ||
  process.env.NEXT_PUBLIC_RELAYER_URL ||
  "http://localhost:3001";

// Whether to require subset proofs for withdrawals
const REQUIRE_SUBSET_PROOF = process.env.REQUIRE_SUBSET_PROOF === "true";

/**
 * POST /api/relay — Withdrawal relay only.
 *
 * Forwards withdrawal requests to the relayer service, which submits
 * the on-chain TX. The relayer adds random delays for timing decorrelation.
 *
 * NOTE: Deposit note generation is handled entirely client-side.
 * The server must never generate nullifiers or secrets.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "deposit") {
      return NextResponse.json(
        { error: "Deposits must be constructed client-side. The server does not generate notes." },
        { status: 400 }
      );
    }

    if (body.action === "withdraw") {
      return handleWithdraw(body);
    }

    if (body.action === "withdraw_swap") {
      return handleWithdrawSwap(body);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function verifySubsetProof(
  subsetProof: Record<string, unknown>,
  subsetRoot: string,
  commitment: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Verify the subset root matches the current approved tree
    const treeInfo = await getSubsetTreeInfo();
    if (subsetRoot !== treeInfo.root) {
      return { valid: false, error: "Subset root mismatch — tree may have been updated" };
    }

    // Verify the commitment is in the approved subset
    if (!isInSubset(commitment)) {
      return { valid: false, error: "Commitment not found in approved subset" };
    }

    // Verify the Groth16 subset proof using snarkjs
    const snarkjs = await import("snarkjs");
    let vk;
    try {
      const fs = await import("fs");
      const path = await import("path");
      const vkPath = path.join(process.cwd(), "public/circuits/subset_verification_key.json");
      vk = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    } catch {
      // VK not available — fail hard, do not skip verification
      return { valid: false, error: "Subset verification key not found — cannot verify proof" };
    }

    const publicSignals = subsetProof.publicSignals as string[];
    const proof = subsetProof.proof as Record<string, unknown>;
    const isValid = await snarkjs.groth16.verify(vk, publicSignals, proof);

    if (!isValid) {
      return { valid: false, error: "Subset proof cryptographic verification failed" };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Verification error" };
  }
}

async function handleWithdraw(body: Record<string, unknown>) {
  const note = body.note as string | undefined;
  const recipient = body.recipient as string | undefined;
  const useRelayer = body.useRelayer !== false;
  const subsetProof = body.subsetProof as Record<string, unknown> | undefined;
  const subsetRoot = body.subsetRoot as string | undefined;
  const commitment = body.commitment as string | undefined;

  if (!note || !recipient) {
    return NextResponse.json(
      { error: "Missing note or recipient" },
      { status: 400 }
    );
  }

  // Validate note format
  const parts = note.split("-");
  if (parts[0] !== "vila" || parts.length !== 5) {
    return NextResponse.json(
      { error: "Invalid note format — must be vila-<nullifier>-<secret>-<denomination>-<leafIndex>" },
      { status: 400 }
    );
  }

  // ── Privacy Pools: verify subset proof if present ──
  let complianceStatus: "verified" | "unverified" | "failed" = "unverified";

  if (subsetProof && subsetRoot && commitment) {
    const result = await verifySubsetProof(subsetProof, subsetRoot, commitment);
    if (result.valid) {
      complianceStatus = "verified";
    } else {
      complianceStatus = "failed";
      // If relayer requires compliance, reject
      if (REQUIRE_SUBSET_PROOF) {
        return NextResponse.json(
          { error: `Compliance proof invalid: ${result.error}` },
          { status: 403 }
        );
      }
    }
  } else if (REQUIRE_SUBSET_PROOF) {
    return NextResponse.json(
      { error: "Subset proof required by this relayer but not provided" },
      { status: 403 }
    );
  }

  // Try forwarding to the relayer service
  if (useRelayer) {
    try {
      const relayResponse = await fetch(`${RELAYER_URL}/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          recipient,
          nullifier: parts[1],
          fee: "0",
          poolContractId: body.poolContractId,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (relayResponse.ok) {
        const data = await relayResponse.json();
        return NextResponse.json(data);
      }
    } catch {
      // Relayer not available — do NOT fall through to fake success
    }
  }

  // Relayer is required for on-chain submission
  return NextResponse.json(
    { error: "Relayer unavailable — withdrawal cannot be processed" },
    { status: 503 }
  );
}

async function handleWithdrawSwap(body: Record<string, unknown>) {
  const note = body.note as string | undefined;
  const recipient = body.recipient as string | undefined;
  const tokenOut = body.tokenOut as string | undefined;
  const useRelayer = body.useRelayer !== false;

  if (!note || !recipient || !tokenOut) {
    return NextResponse.json(
      { error: "Missing note, recipient, or tokenOut" },
      { status: 400 }
    );
  }

  const parts = note.split("-");
  if (parts[0] !== "vila" || parts.length !== 5) {
    return NextResponse.json(
      { error: "Invalid note format" },
      { status: 400 }
    );
  }

  // Try forwarding to the relayer's swap endpoint
  if (useRelayer) {
    try {
      const relayResponse = await fetch(`${RELAYER_URL}/relay-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          recipient,
          nullifier: parts[1],
          fee: "0",
          tokenOut,
          minAmountOut: body.minAmountOut || "0",
          poolContractId: body.poolContractId,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (relayResponse.ok) {
        const data = await relayResponse.json();
        return NextResponse.json(data);
      }
    } catch {
      // Relayer not available — do NOT fall through to fake success
    }
  }

  // Relayer is required for on-chain submission
  return NextResponse.json(
    { error: "Relayer unavailable — swap withdrawal cannot be processed" },
    { status: 503 }
  );
}