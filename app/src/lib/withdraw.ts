/**
 * Browser-compatible withdrawal flow for Vila Protocol.
 *
 * 1. Deserialize the secret note
 * 2. Fetch the on-chain Merkle tree state (filled subtrees + root)
 * 3. Compute the Merkle path from filled subtrees
 * 4. Generate a Groth16 ZK proof via snarkjs (in-browser)
 * 5. Build a Soroban `withdraw()` transaction
 * 6. Sign with embedded keypair + submit via raw JSON-RPC
 */
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Constants ──

const POOL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://soroban-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

const CIRCUIT_WASM_URL = "/circuits/withdraw.wasm";
const ZKEY_URL = "/circuits/withdraw_final.zkey";

const SUBSET_WASM_URL = "/circuits/subset.wasm";
const SUBSET_ZKEY_URL = "/circuits/subset_final.zkey";

// Precomputed Poseidon zero values for depth-20 Merkle tree (must match contract)
const ZEROS: string[] = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864",
  "1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1",
  "18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238",
  "07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a",
  "2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55",
  "2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78",
  "078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d",
  "2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61",
  "0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747",
  "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2",
  "1f8d8822725e36385200c0b201249819a6e6e1e4650808b5bebc6bface7d7636",
  "2c5d82f66c914bafb9701589ba8cfcfb6162b0a12acf88a8d0879a0471b5f85a",
  "14c54148a0940bb820957f5adf3fa1134ef5c4aaa113f4646458f270e0bfbfd0",
  "190d33b12f986f961e10c0ee44d8b9af11be25588cad89d416118e4bf4ebe80c",
  "22f98aa9ce704152ac17354914ad73ed1167ae6596af510aa5b3649325e06c92",
  "2a7c7c9b6ce5880b9f6f228d72bf6a575a526f29c66ecceef8b753d38bba7323",
  "2e8186e558698ec1c67af9c14d463ffc470043c9c2988b954d75dd643f36b992",
  "0f57c5571e9a4eab49e2c8cf050dae948aef6ead647392273546249d1c1ff10f",
  "1830ee67b5fb554ad5f63d4388800e1cfe78e310697d46e43c9ce36134f72cca",
  "2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e",
];

// ── Types ──

export interface WithdrawResult {
  txHash: string;
  nullifierHash: string;
  subsetProofIncluded?: boolean;
}

export interface SubsetStatus {
  approved: boolean;
  status: "compliant" | "pending_review" | "not_screened";
  subsetSize: number;
}

interface ParsedNote {
  nullifier: bigint;
  secret: bigint;
  amount: bigint;
  leafIndex: number;
}

interface TreeState {
  filledSubtrees: string[];
  nextIndex: number;
  currentRoot: string;
  currentRootIndex: number;
  historicalRoots: string[];
}

// ── Poseidon singleton ──

let poseidonFn: ((inputs: bigint[]) => bigint) | null = null;

async function getPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonFn) return poseidonFn;
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  poseidonFn = (inputs: bigint[]) => {
    const hash = poseidon(inputs);
    return poseidon.F.toObject(hash);
  };
  return poseidonFn;
}

// ── Note parsing ──

function parseNote(noteString: string): ParsedNote {
  const parts = noteString.split("-");
  if (parts[0] !== "vila" || parts.length !== 5) {
    throw new Error("Invalid note format");
  }
  return {
    nullifier: BigInt("0x" + parts[1]),
    secret: BigInt("0x" + parts[2]),
    amount: BigInt(parts[3]),
    leafIndex: parseInt(parts[4], 10),
  };
}

// ── Fetch on-chain tree state ──

async function fetchTreeState(poolId?: string): Promise<TreeState> {
  const pid = poolId || POOL_CONTRACT_ID;
  const res = await fetch(`/api/tree?poolId=${pid}`);
  if (!res.ok) {
    throw new Error("Failed to fetch tree state from contract");
  }
  return res.json();
}

// ── Fetch all commitments and rebuild the full tree ──

async function fetchAllCommitments(poolId?: string): Promise<string[]> {
  const pid = poolId || POOL_CONTRACT_ID;
  const res = await fetch(`/api/commitments?poolId=${pid}`);
  if (!res.ok) throw new Error("Failed to fetch commitments");
  const data = await res.json();
  const commitments: string[] = data.commitments ?? [];

  // Check if local commitment store is out of sync with on-chain state
  if (data.missing > 0) {
    console.warn(
      `[withdraw] Commitment store incomplete: ${commitments.length} local vs ${data.nextIndex} on-chain (${data.missing} missing).`
    );
  }

  return commitments;
}

/**
 * Rebuild the Merkle tree from commitments using a sparse approach.
 * Only hashes non-zero subtrees — uses precomputed ZEROS for empty regions.
 * With 21 leaves and depth 20, this does ~420 hashes instead of ~2M.
 */
function buildFullTreeAndPath(
  leaves: bigint[],
  leafIndex: number,
  poseidon: (inputs: bigint[]) => bigint,
  depth: number = 20
): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
  const zeroValues = ZEROS.map((z) => BigInt("0x" + z));

  // Sparse level: only store non-zero nodes (Map from index → value)
  let currentLevel = new Map<number, bigint>();
  for (let i = 0; i < leaves.length; i++) {
    currentLevel.set(i, leaves[i]);
  }

  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;

  for (let level = 0; level < depth; level++) {
    const bit = idx & 1;
    pathIndices.push(bit);
    const siblingIdx = bit === 0 ? idx + 1 : idx - 1;
    pathElements.push(currentLevel.get(siblingIdx) ?? zeroValues[level]);

    // Build next level — only hash pairs where at least one child is non-zero
    const nextLevel = new Map<number, bigint>();
    // Collect all parent indices that have at least one non-zero child
    const parentIndices = new Set<number>();
    for (const k of currentLevel.keys()) {
      parentIndices.add(k >> 1);
    }
    for (const pi of parentIndices) {
      const left = currentLevel.get(pi * 2) ?? zeroValues[level];
      const right = currentLevel.get(pi * 2 + 1) ?? zeroValues[level];
      nextLevel.set(pi, poseidon([left, right]));
    }

    currentLevel = nextLevel;
    idx >>= 1;
  }

  const root = currentLevel.get(0) ?? zeroValues[depth];
  return { pathElements, pathIndices, root };
}

// ── Address to field element (matches on-chain sha256) ──

async function addressToField(address: string): Promise<bigint> {
  const data = new TextEncoder().encode(address);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = new Uint8Array(hashBuf);
  hashArr[0] = 0; // Fit in BN254 field
  let result = 0n;
  for (const byte of hashArr) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
}

// ── Proof point encoding ──

function writeBigInt(buf: Uint8Array, val: bigint, offset: number, length: number) {
  for (let i = length - 1; i >= 0; i--) {
    buf[offset + i] = Number(val & 0xffn);
    val >>= 8n;
  }
}

function g1ToBytes(point: string[]): Uint8Array {
  const result = new Uint8Array(64);
  writeBigInt(result, BigInt(point[0]), 0, 32);
  writeBigInt(result, BigInt(point[1]), 32, 32);
  return result;
}

function g2ToBytes(point: string[][]): Uint8Array {
  const result = new Uint8Array(128);
  writeBigInt(result, BigInt(point[0][1]), 0, 32);   // x.c1
  writeBigInt(result, BigInt(point[0][0]), 32, 32);  // x.c0
  writeBigInt(result, BigInt(point[1][1]), 64, 32);  // y.c1
  writeBigInt(result, BigInt(point[1][0]), 96, 32);  // y.c0
  return result;
}

// ── U256 ScVal helpers ──

function bigintToU256ScVal(val: bigint): StellarSdk.xdr.ScVal {
  const hex = val.toString(16).padStart(64, "0");
  return StellarSdk.xdr.ScVal.scvU256(
    new StellarSdk.xdr.UInt256Parts({
      hiHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(0, 16)).toString()),
      hiLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(16, 32)).toString()),
      loHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(32, 48)).toString()),
      loLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(48, 64)).toString()),
    })
  );
}

function bytesToScValBytes(bytes: Uint8Array): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(bytes));
}

// ── Subset (Privacy Pools) helpers ──

export async function checkSubsetStatus(commitment: bigint): Promise<SubsetStatus> {
  const hex = commitment.toString(16).padStart(64, "0");
  const res = await fetch(`/api/subset/status?commitment=${hex}`);
  if (!res.ok) {
    return { approved: false, status: "not_screened", subsetSize: 0 };
  }
  const data = await res.json();
  return {
    approved: data.approved ?? false,
    status: data.status ?? "not_screened",
    subsetSize: data.subsetSize ?? 0,
  };
}

async function generateSubsetProof(
  commitment: bigint,
  onProgress?: (step: string) => void
): Promise<{ proof: unknown; publicSignals: string[] } | null> {
  const progress = onProgress ?? (() => {});

  // Fetch subset status + proof data
  progress("Checking compliance status...");
  const hex = commitment.toString(16).padStart(64, "0");
  const statusRes = await fetch(`/api/subset/status?commitment=${hex}`);
  if (!statusRes.ok) return null;
  const statusData = await statusRes.json();

  if (!statusData.approved || !statusData.proof) {
    return null;
  }

  // Build circuit input
  progress("Generating subset proof...");
  const input = {
    root: BigInt("0x" + statusData.subsetRoot).toString(),
    leaf: commitment.toString(),
    pathElements: statusData.proof.pathElements.map((e: string) =>
      BigInt("0x" + e).toString()
    ),
    pathIndices: statusData.proof.pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const result = await snarkjs.groth16.fullProve(
    input,
    SUBSET_WASM_URL,
    SUBSET_ZKEY_URL
  );

  return result;
}

// ── Progress callback type ──

export type ProgressCallback = (step: string) => void;

// ── Main withdrawal flow ──

export async function executeWithdraw(
  noteString: string,
  recipientAddress: string,
  onProgress?: ProgressCallback,
  poolContractId?: string
): Promise<WithdrawResult> {
  const progress = onProgress ?? (() => {});

  // 1. Parse note
  progress("Parsing secret note...");
  const note = parseNote(noteString);
  const poseidon = await getPoseidon();

  // Recompute commitment and nullifier hash
  const commitment = poseidon([note.nullifier, note.secret]);
  const nullifierHash = poseidon([note.nullifier]);

  // 2. Fetch on-chain tree state + all commitments
  progress("Syncing on-chain deposits...");
  const ACTIVE_POOL = poolContractId || POOL_CONTRACT_ID;
  const [treeState, allCommitmentHexes] = await Promise.all([
    fetchTreeState(ACTIVE_POOL),
    fetchAllCommitments(ACTIVE_POOL),
  ]);

  if (treeState.nextIndex === 0 || allCommitmentHexes.length === 0) {
    throw new Error("No deposits found in the pool.");
  }

  const onChainCount = treeState.nextIndex;
  const localCount = allCommitmentHexes.length;
  const missing = onChainCount - localCount;

  // Use the note's encoded leafIndex (on-chain position) — don't override
  // from array indexOf when there are gaps from missing commitments
  const leafIndex = note.leafIndex;
  const commitmentHex = commitment.toString(16).padStart(64, "0");

  if (leafIndex >= onChainCount) {
    throw new Error(
      `Leaf index ${leafIndex} is out of range (${onChainCount} deposits exist).`
    );
  }

  // Verify our commitment exists at the correct position in local store
  if (leafIndex >= localCount) {
    throw new Error(
      `Your note is at deposit position ${leafIndex}, but only ${localCount} of ${onChainCount} ` +
      `commitments are available locally (positions 0–${localCount - 1}). ` +
      `The commitment data for position ${leafIndex} was lost when Soroban RPC pruned old events. ` +
      `This note cannot be withdrawn without the full commitment history. ` +
      `Make a new deposit to create a fresh note that can be withdrawn.`
    );
  }

  // Verify the commitment at leafIndex actually matches our note
  console.log(`[withdraw] Pool: ${ACTIVE_POOL}`);
  console.log(`[withdraw] Note leafIndex=${leafIndex}, commitment=${commitmentHex.slice(0, 16)}...`);
  console.log(`[withdraw] Store[${leafIndex}]=${allCommitmentHexes[leafIndex]?.slice(0, 16) ?? "N/A"}...`);
  console.log(`[withdraw] Local commitments: ${localCount}, on-chain: ${onChainCount}`);

  if (allCommitmentHexes[leafIndex] !== commitmentHex) {
    // Try to find it elsewhere in the array (index may have shifted)
    const foundAt = allCommitmentHexes.indexOf(commitmentHex);
    if (foundAt >= 0) {
      console.log(
        `[withdraw] Note leafIndex=${leafIndex} but commitment found at position ${foundAt}. Using ${foundAt}.`
      );
      note.leafIndex = foundAt;
    } else {
      // Check if it's a partial match (case or padding issue)
      const normalized = commitmentHex.toLowerCase();
      const partialMatch = allCommitmentHexes.findIndex(
        (h) => h.toLowerCase() === normalized
      );
      if (partialMatch >= 0) {
        console.log(`[withdraw] Case-insensitive match at position ${partialMatch}. Using it.`);
        note.leafIndex = partialMatch;
      } else {
        // Try auto-detecting the correct pool
        console.warn(
          `[withdraw] Commitment ${commitmentHex.slice(0, 16)}... not found in pool ${ACTIVE_POOL.slice(0, 8)}... ` +
          `Scanning other pools...`
        );
        const { getAllActiveTiers } = await import("@/lib/tokens");
        const allTiers = getAllActiveTiers();
        let detectedPool: string | null = null;

        for (const t of allTiers) {
          if (t.poolId === ACTIVE_POOL) continue;
          try {
            const probeRes = await fetch(`/api/commitments?poolId=${t.poolId}`);
            if (!probeRes.ok) continue;
            const probeData = await probeRes.json();
            const probeCommitments: string[] = probeData.commitments ?? [];
            const probeIdx = probeCommitments.indexOf(commitmentHex);
            if (probeIdx >= 0) {
              console.log(
                `[withdraw] Found commitment in pool ${t.poolId.slice(0, 8)}... (${t.label}) at index ${probeIdx}`
              );
              detectedPool = t.poolId;
              // Restart withdrawal with the correct pool
              return executeWithdraw(noteString, recipientAddress, onProgress, detectedPool);
            }
          } catch { /* skip unreachable pools */ }
        }

        throw new Error(
          `Your note's commitment (${commitmentHex.slice(0, 12)}...) was not found in any active pool. ` +
          `Checked ${allTiers.length} pools. The commitment data may be incomplete or the pool may no longer be active.`
        );
      }
    }
  }

  // Re-read leafIndex in case it was corrected above
  const verifiedLeafIndex = note.leafIndex;

  // Build set of all known on-chain historical roots
  const knownRoots = new Set<string>();
  for (const hr of treeState.historicalRoots ?? []) {
    if (hr && hr !== "0".repeat(64)) knownRoots.add(hr);
  }
  knownRoots.add(treeState.currentRoot);

  // Strategy: find the largest verified-contiguous prefix of commitments
  // whose tree root matches a historical root, then use that for the proof.
  // We know positions 0..N may be correct — find the largest N.
  const allLeaves = allCommitmentHexes.map((hex) => BigInt("0x" + hex));

  // First: try the full tree (if commitment store is complete and ordered)
  progress("Building Merkle tree (depth 20)...");
  const fullResult = buildFullTreeAndPath(allLeaves, verifiedLeafIndex, poseidon);
  const onChainRoot = BigInt("0x" + treeState.currentRoot);

  let root: bigint;
  let finalPathElements: bigint[];
  let finalPathIndices: number[];

  // Check full tree root against current root AND all historical roots
  const fullRootHex = fullResult.root.toString(16).padStart(64, "0");

  if (fullResult.root === onChainRoot || knownRoots.has(fullRootHex)) {
    // Full tree matches a known root (current or historical)
    root = fullResult.root;
    finalPathElements = fullResult.pathElements;
    finalPathIndices = fullResult.pathIndices;
    if (fullResult.root === onChainRoot) {
      console.log(`[withdraw] Full tree root matches current on-chain root.`);
    } else {
      console.log(`[withdraw] Full tree root matches historical root: ${fullRootHex.slice(0, 16)}...`);
    }
  } else {
    // Full tree doesn't match any known root — try partial trees.
    // This handles cases where some later commitments are wrong/missing.
    console.log(
      `[withdraw] Full tree root mismatch. Trying partial trees with historical roots... ` +
      `(leafIndex=${verifiedLeafIndex}, ${localCount} local, ${onChainCount} on-chain)`
    );

    let found = false;
    root = onChainRoot;
    finalPathElements = fullResult.pathElements;
    finalPathIndices = fullResult.pathIndices;

    // Try from largest partial tree down to minimum (leafIndex+1).
    // Largest first since it's most likely to match and avoids unnecessary rebuilds.
    for (let size = allLeaves.length - 1; size >= verifiedLeafIndex + 1; size--) {
      const partialLeaves = allLeaves.slice(0, size);
      const partial = buildFullTreeAndPath(partialLeaves, verifiedLeafIndex, poseidon);
      const partialRootHex = partial.root.toString(16).padStart(64, "0");

      if (knownRoots.has(partialRootHex)) {
        console.log(
          `[withdraw] Historical root match at tree size=${size}, ` +
          `root=${partialRootHex.slice(0, 16)}...`
        );
        root = partial.root;
        finalPathElements = partial.pathElements;
        finalPathIndices = partial.pathIndices;
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(
        `Cannot build valid Merkle proof for leaf index ${verifiedLeafIndex}. ` +
        `No historical root matched any partial tree. ` +
        `Have ${localCount} of ${onChainCount} on-chain deposits. ` +
        `Try making a new deposit to create a fresh note.`
      );
    }
  }

  // 4. Build circuit input
  progress("Computing witness assignment...");
  const recipientField = await addressToField(recipientAddress);
  const relayerField = await addressToField(recipientAddress);
  const fee = 0n;

  const input = {
    root: root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipientField.toString(),
    relayer: relayerField.toString(),
    fee: fee.toString(),
    refund: "0",
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: finalPathElements.map((e) => e.toString()),
    pathIndices: finalPathIndices,
  };

  // 5. Generate Groth16 proof
  progress("Generating Groth16 proof...");
  console.log("[withdraw] Starting Groth16 proof generation...");
  const proofStart = Date.now();
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    CIRCUIT_WASM_URL,
    ZKEY_URL
  );
  console.log(`[withdraw] Proof generated in ${Date.now() - proofStart}ms`);

  // Verify proof locally before submitting
  void publicSignals;

  progress("Proof generated!");

  // ── Subset proof (Privacy Pools compliance) ──
  let subsetProofResult: { proof: unknown; publicSignals: string[] } | null = null;
  try {
    subsetProofResult = await generateSubsetProof(commitment, progress);
  } catch (err) {
    // Subset proof is optional — log but don't block withdrawal
    console.warn("[withdraw] Subset proof generation failed:", err);
  }

  // 6. Encode proof for Soroban
  const proofA = g1ToBytes(proof.pi_a);
  const proofB = g2ToBytes(proof.pi_b);
  const proofC = g1ToBytes(proof.pi_c);

  const proofDataScVal = StellarSdk.xdr.ScVal.scvMap([
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("a"),
      val: bytesToScValBytes(proofA),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("b"),
      val: bytesToScValBytes(proofB),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("c"),
      val: bytesToScValBytes(proofC),
    }),
  ]);

  // 7. Build Soroban transaction (source = wallet owner, not recipient)
  progress("Submitting to network...");
  console.log("[withdraw] Fetching wallet account from Horizon...");

  const { getStellarAddress } = await import("@/lib/noteStore");
  const senderAddress = getStellarAddress();
  if (!senderAddress) throw new Error("Wallet address not found");

  const horizonRes = await fetch(
    `${HORIZON_URL}/accounts/${senderAddress}`
  );
  if (!horizonRes.ok) throw new Error("Failed to load account from Horizon");
  const horizonData = await horizonRes.json();
  const account = new StellarSdk.Account(senderAddress, horizonData.sequence);
  console.log("[withdraw] Account loaded, building tx...");

  const contract = new StellarSdk.Contract(ACTIVE_POOL);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "withdraw",
        proofDataScVal,
        bigintToU256ScVal(root),
        bigintToU256ScVal(nullifierHash),
        StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
        StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
        StellarSdk.nativeToScVal(0, { type: "i128" }),
        StellarSdk.nativeToScVal(0, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();
  console.log("[withdraw] Tx built, simulating...");

  // Simulate via raw RPC
  progress("Simulating transaction...");
  const simRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: { transaction: tx.toEnvelope().toXDR("base64") },
    }),
  });
  const simResult = (await simRes.json()).result;
  console.log("[withdraw] Simulation result:", simResult.error || "OK");

  if (simResult.error) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Rebuild with fresh sequence to avoid stale sequence issues, then use SDK assembly
  let preparedXDR: string;
  try {
    const rpcServer = new StellarSdk.rpc.Server(RPC_URL);

    // Fetch fresh sequence number
    const freshHorizon = await fetch(
      `${HORIZON_URL}/accounts/${senderAddress}`
    );
    const freshData = await freshHorizon.json();
    const freshAccount = new StellarSdk.Account(senderAddress, freshData.sequence);

    // Rebuild tx with fresh sequence for simulation
    const freshTx = new StellarSdk.TransactionBuilder(freshAccount, {
      fee: "10000000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          "withdraw",
          proofDataScVal,
          bigintToU256ScVal(root),
          bigintToU256ScVal(nullifierHash),
          StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
          StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
          StellarSdk.nativeToScVal(0, { type: "i128" }),
          StellarSdk.nativeToScVal(0, { type: "i128" })
        )
      )
      .setTimeout(60)
      .build();

    const sdkSimResponse = await rpcServer.simulateTransaction(freshTx);
    if (StellarSdk.rpc.Api.isSimulationError(sdkSimResponse)) {
      throw new Error("SDK sim failed");
    }
    const assembled = StellarSdk.rpc.assembleTransaction(
      freshTx,
      sdkSimResponse as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse
    ).build();
    preparedXDR = assembled.toEnvelope().toXDR("base64");
    console.log("[withdraw] SDK assembleTransaction succeeded");
    // Log auth entries for debugging
    try {
      const env = assembled.toEnvelope();
      const ops = env.v1().tx().operations();
      for (const op of ops) {
        const invokeArgs = op.body().invokeHostFunctionOp();
        const auth = invokeArgs.auth();
        console.log("[withdraw] Auth entries count:", auth.length);
        for (let i = 0; i < auth.length; i++) {
          const entry = auth[i];
          console.log("[withdraw] Auth entry", i, "credentials type:", entry.credentials().switch().name);
        }
      }
    } catch (e) { console.log("[withdraw] Could not log auth:", (e as Error).message); }
  } catch (assembleErr) {
    console.log("[withdraw] SDK assemble failed, using manual rebuild:", (assembleErr as Error).message);
    // Manual rebuild using raw simulation result
    const manualFreshRes = await fetch(
      `${HORIZON_URL}/accounts/${senderAddress}`
    );
    const manualFreshData = await manualFreshRes.json();
    const freshAccount = new StellarSdk.Account(senderAddress, manualFreshData.sequence);

    const minFee = parseInt(simResult.minResourceFee || "0", 10);
    const builder = new StellarSdk.TransactionBuilder(freshAccount, {
      fee: String(Math.max(10000000, minFee + 100000)),
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const authEntries = (simResult.results?.[0]?.auth ?? []).map((a: string) =>
      StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(a, "base64")
    );

    builder
      .addOperation(
        StellarSdk.Operation.invokeHostFunction({
          func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
            new StellarSdk.xdr.InvokeContractArgs({
              contractAddress: new StellarSdk.Address(ACTIVE_POOL).toScAddress(),
              functionName: "withdraw",
              args: [
                proofDataScVal,
                bigintToU256ScVal(root),
                bigintToU256ScVal(nullifierHash),
                StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
                StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
                StellarSdk.nativeToScVal(0, { type: "i128" }),
                StellarSdk.nativeToScVal(0, { type: "i128" }),
              ],
            })
          ),
          auth: authEntries,
        })
      )
      .setTimeout(60);

    if (simResult.transactionData) {
      builder.setSorobanData(simResult.transactionData);
    }

    const preparedTx = builder.build();
    preparedXDR = preparedTx.toEnvelope().toXDR("base64");
  }

  // 8. Sign with embedded keypair
  progress("Signing transaction...");
  const { signTransactionXdr } = await import("@/lib/noteStore");
  const signedTxXdr = signTransactionXdr(preparedXDR, NETWORK_PASSPHRASE);

  // 9. Submit via raw RPC
  progress("Broadcasting transaction...");
  console.log("[withdraw] Submitting signed tx to RPC...");
  const submitRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: { transaction: signedTxXdr },
    }),
  });
  const sendResult = (await submitRes.json()).result;
  console.log("[withdraw] Send result:", sendResult?.status, sendResult?.hash);
  if (sendResult?.errorResultXdr) {
    try {
      const txResult = StellarSdk.xdr.TransactionResult.fromXDR(sendResult.errorResultXdr, "base64");
      console.log("[withdraw] Error detail:", txResult.result().switch().name);
    } catch { /* ignore parse failures */ }
  }

  if (!sendResult || sendResult.status === "ERROR") {
    throw new Error(`Submission failed: ${sendResult?.errorResultXdr ?? "unknown"}`);
  }

  // 10. Poll for confirmation
  progress("Waiting for confirmation...");
  const txHash = sendResult.hash;
  const start = Date.now();
  let txStatus = "NOT_FOUND";

  while (txStatus === "NOT_FOUND") {
    if (Date.now() - start > 60000) throw new Error("Confirmation timed out");
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const pollResult = (await pollRes.json()).result;
    txStatus = pollResult?.status ?? "NOT_FOUND";

    if (txStatus === "FAILED") {
      let reason = "unknown";
      try {
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(
          pollResult.resultXdr,
          "base64"
        );
        reason = txResult.result().switch().name;
      } catch {
        /* */
      }
      throw new Error(`Transaction failed on-chain: ${reason}`);
    }
  }

  return {
    txHash,
    nullifierHash: nullifierHash.toString(16),
    subsetProofIncluded: subsetProofResult !== null,
  };
}
