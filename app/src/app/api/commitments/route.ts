import { NextRequest, NextResponse } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const DEFAULT_POOL =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://soroban-testnet.stellar.org";

// File-based commitment store per pool (survives RPC event pruning)
function storePath(poolId: string): string {
  const safe = poolId.replace(/[^A-Za-z0-9]/g, "");
  return path.join(process.cwd(), `.commitments-${safe}.json`);
}

function legacyStorePath(): string {
  return path.join(process.cwd(), ".commitments.json");
}

function readStore(poolId: string): string[] {
  try {
    const p = storePath(poolId);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch { /* corrupted file — start fresh */ }
  return [];
}

/** Read the legacy .commitments.json (no pool suffix) for migration. */
function readLegacyStore(): string[] {
  try {
    const p = legacyStorePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch { /* corrupted or missing */ }
  return [];
}

function writeStore(poolId: string, commitments: string[]) {
  fs.writeFileSync(storePath(poolId), JSON.stringify(commitments, null, 2));
}

function u256ToHex(u256: StellarSdk.xdr.UInt256Parts): string {
  return [
    u256.hiHi().toBigInt(),
    u256.hiLo().toBigInt(),
    u256.loHi().toBigInt(),
    u256.loLo().toBigInt(),
  ]
    .map((v) => v.toString(16).padStart(16, "0"))
    .join("");
}

/**
 * Get the on-chain nextIndex for a pool to know how many commitments exist.
 */
async function getOnChainNextIndex(poolId: string): Promise<number> {
  const contractAddr = new StellarSdk.Address(poolId);
  const key = StellarSdk.xdr.ScVal.scvVec([
    StellarSdk.xdr.ScVal.scvSymbol("NextIndex"),
  ]);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: contractAddr.toScAddress(),
      key,
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  ).toXDR("base64");

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getLedgerEntries",
      params: { keys: [ledgerKey] },
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.result?.entries?.length) {
    const data = StellarSdk.xdr.LedgerEntryData.fromXDR(
      json.result.entries[0].xdr,
      "base64"
    );
    return data.contractData().val().value() as number;
  }
  return 0;
}

/**
 * Fetch deposit commitments from on-chain events (if still in RPC window).
 */
async function fetchFromEvents(poolContractId: string): Promise<string[]> {
  const healthRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  const healthJson = await healthRes.json();
  const startLedger = healthJson.result?.oldestLedger;
  if (!startLedger) return [];

  const commitments: string[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, unknown> = {
      filters: [{ type: "contract", contractIds: [poolContractId] }],
      pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
    };
    if (!cursor) params.startLedger = startLedger;

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEvents", params }),
    });
    const json = await res.json();
    if (json.error) break;

    const events = json.result?.events ?? [];

    for (const evt of events) {
      if (!evt.inSuccessfulContractCall) continue;
      const isDeposit = evt.topic?.some(
        (t: string) => t === "AAAADwAAAA1kZXBvc2l0X2V2ZW50AAAA"
      );
      if (!isDeposit) continue;

      const raw = Buffer.from(evt.value, "base64");
      let u256Offset = -1;
      for (let i = 0; i < raw.length - 36; i++) {
        if (raw[i] === 0 && raw[i + 1] === 0 && raw[i + 2] === 0 && raw[i + 3] === 0x0b) {
          u256Offset = i + 4;
          break;
        }
      }
      if (u256Offset >= 0 && u256Offset + 32 <= raw.length) {
        commitments.push(raw.subarray(u256Offset, u256Offset + 32).toString("hex"));
      }
    }

    hasMore = events.length >= 100;
    if (hasMore) cursor = events[events.length - 1].id;
  }

  return commitments;
}

/**
 * Fetch deposit commitments from Soroban RPC getTransactions (different retention than events).
 * Scans transaction envelopes for deposit calls to the pool contract.
 */
async function fetchFromTransactions(poolContractId: string): Promise<string[]> {
  const poolAddrXdr = new StellarSdk.Address(poolContractId)
    .toScAddress()
    .toXDR("hex");

  const healthRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  const healthJson = await healthRes.json();
  const startLedger = healthJson.result?.oldestLedger;
  if (!startLedger) return [];

  const commitments: string[] = [];
  let cursor: string | undefined;
  let pages = 0;

  while (pages < 500) {
    pages++;
    const params: Record<string, unknown> = {
      pagination: { limit: 200, ...(cursor ? { cursor } : {}) },
    };
    if (!cursor) params.startLedger = startLedger;

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransactions",
        params,
      }),
    });
    const json = await res.json();
    const txs = json.result?.transactions ?? [];
    if (txs.length === 0) break;

    for (const tx of txs) {
      if (tx.status !== "SUCCESS") continue;
      if (!tx.envelopeXdr) continue;

      try {
        const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(
          tx.envelopeXdr,
          "base64"
        );
        const ops = envelope.v1().tx().operations();

        for (const op of ops) {
          if (op.body().switch().name !== "invokeHostFunction") continue;
          const hf = op.body().invokeHostFunctionOp().hostFunction();
          if (hf.switch().name !== "hostFunctionTypeInvokeContract") continue;

          const invokeArgs = hf.invokeContract();
          const contractAddress = invokeArgs.contractAddress().toXDR("hex");
          if (contractAddress !== poolAddrXdr) continue;

          const fnName = invokeArgs.functionName().toString();
          if (fnName !== "deposit") continue;

          const args = invokeArgs.args();
          if (args.length >= 2 && args[1].switch().name === "scvU256") {
            commitments.push(u256ToHex(args[1].u256()));
          }
        }
      } catch {
        // XDR parse error (protocol compat) — try raw byte extraction as fallback
        try {
          const rawHex = Buffer.from(tx.envelopeXdr, "base64").toString("hex");
          if (!rawHex.includes(poolAddrXdr)) continue;

          // Look for "deposit" symbol marker in XDR
          const depositMarker = "000000076465706f73697400"; // SCVal symbol "deposit"
          if (!rawHex.includes(depositMarker)) continue;

          // Find U256 values after the deposit marker
          const searchStart = rawHex.indexOf(depositMarker);
          const searchArea = rawHex.slice(searchStart);

          // U256 ScVal tag = 0x0000000b followed by 32 bytes (4x uint64)
          let pos = 0;
          while (pos < searchArea.length) {
            const idx = searchArea.indexOf("0000000b", pos);
            if (idx === -1) break;
            const u256hex = searchArea.slice(idx + 8, idx + 8 + 64);
            if (u256hex.length === 64) {
              const val = BigInt("0x" + u256hex);
              // Valid commitment: reasonable range (not zero, not a small int)
              if (val > 1000000n) {
                commitments.push(u256hex);
              }
            }
            pos = idx + 8;
          }
        } catch {
          // Skip entirely unparseable transactions
        }
      }
    }

    cursor = txs[txs.length - 1].cursor;
  }

  return commitments;
}

/**
 * GET /api/commitments — Returns merged commitment list from all sources.
 * Sources (in priority order):
 * 1. Local file store (per-pool)
 * 2. Legacy .commitments.json (for the default pool)
 * 3. On-chain events (if still in RPC window)
 * 4. Transaction history scanning (different retention window)
 */
export async function GET(req: NextRequest) {
  try {
    const poolId = req.nextUrl.searchParams.get("poolId") || DEFAULT_POOL;
    const stored = readStore(poolId);

    // Merge in legacy store if this is the default pool
    const legacy = poolId === DEFAULT_POOL ? readLegacyStore() : [];

    // Fetch from on-chain sources in parallel
    const [fromEvents, fromTxs] = await Promise.all([
      fetchFromEvents(poolId).catch(() => [] as string[]),
      fetchFromTransactions(poolId).catch(() => [] as string[]),
    ]);

    // Merge all sources preserving order: stored first, then legacy, then on-chain
    const seen = new Set(stored);
    const merged = [...stored];

    for (const source of [legacy, fromEvents, fromTxs]) {
      for (const c of source) {
        if (!seen.has(c)) {
          merged.push(c);
          seen.add(c);
        }
      }
    }

    // Check against on-chain nextIndex to detect missing commitments
    let nextIndex = 0;
    try {
      nextIndex = await getOnChainNextIndex(poolId);
    } catch { /* non-fatal */ }

    // Persist merged list if we found new ones
    if (merged.length > stored.length) {
      writeStore(poolId, merged);
    }

    return NextResponse.json({
      commitments: merged,
      nextIndex,
      synced: merged.length >= nextIndex,
      missing: Math.max(0, nextIndex - merged.length),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commitments — Store a new commitment after a successful deposit.
 * Body: { commitment: "hex string", poolId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commitment = body?.commitment;

    if (!commitment || typeof commitment !== "string" || !/^[0-9a-f]{1,64}$/i.test(commitment)) {
      return NextResponse.json({ error: "Invalid commitment hex" }, { status: 400 });
    }

    const poolId = body?.poolId || DEFAULT_POOL;
    const normalized = commitment.toLowerCase().padStart(64, "0");
    const stored = readStore(poolId);

    if (!stored.includes(normalized)) {
      stored.push(normalized);
      writeStore(poolId, stored);
    }

    return NextResponse.json({ ok: true, total: stored.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
