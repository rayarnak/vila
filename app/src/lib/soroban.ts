/**
 * Soroban contract integration layer for Vila Protocol.
 * =====================================================
 *
 * This is the single, canonical module that connects the frontend to the
 * deployed Soroban smart contracts using `@stellar/stellar-sdk`. Every function
 * here maps 1:1 to a public `pub fn` in the contract `lib.rs` sources:
 *
 *   contracts/vila-pool/src/lib.rs
 *     deposit, deposit_with_note, withdraw, withdraw_swap, set_swap_router,
 *     is_known_root, get_last_root, get_next_index, is_spent,
 *     get_encrypted_note, get_denomination, initialize
 *
 *   contracts/groth16-verifier/src/lib.rs
 *     verify, num_public_inputs, initialize
 *
 *   contracts/swap-router/src/lib.rs
 *     get_amount_out, set_rate, swap, initialize
 *
 * Read-only calls are executed here via `simulateTransaction`. State-changing
 * calls (deposit / withdraw / swap) build + simulate + sign + submit through the
 * dedicated flows in `deposit.ts` and `withdraw.ts`, which are re-exported at
 * the bottom of this file so the whole contract surface is reachable from one
 * place.
 */

import * as StellarSdk from "@stellar/stellar-sdk";

/* ── Network + deployed contract addresses (Stellar Testnet) ─────────────── */

export const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

/** Deployed contract IDs (see README → Deployment). */
export const CONTRACTS = {
  /** Groth16 BN254 proof verifier. */
  verifier:
    process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID ??
    "CDKNHFXE5SSLFS4HKRWTQDORV7CCDBJGBKZ42M56OS555KTSXBAYCIBM",
  /** Default shielded pool (100 XLM tier). */
  pool:
    process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
    "CB5C4ULIVLFL3B3FBX5EPEZAAE5G7NPU3TDMEKPSEVUFTIHBONN6COA6",
  /** Optional swap router used by `withdraw_swap`. */
  swapRouter: process.env.NEXT_PUBLIC_SWAP_ROUTER_ID ?? "",
  /** Stellar Asset Contracts. */
  xlmToken:
    process.env.NEXT_PUBLIC_XLM_TOKEN_ID ??
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  usdcToken:
    process.env.NEXT_PUBLIC_USDC_TOKEN_ID ??
    "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
} as const;

/* ── Low-level invocation helpers ───────────────────────────────────────── */

// A throwaway source account is sufficient for read-only simulation — no
// signing or funding is required to simulate a contract call.
const SIMULATION_SOURCE =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

/**
 * Simulate a read-only contract method and return the decoded native value.
 * Uses `@stellar/stellar-sdk` to build the invocation and the Soroban RPC
 * `simulateTransaction` endpoint to evaluate it.
 */
export async function readContract<T = unknown>(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[] = []
): Promise<T | null> {
  const server = new StellarSdk.rpc.Server(RPC_URL);
  const account = new StellarSdk.Account(SIMULATION_SOURCE, "0");
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationSuccess(sim) && sim.result) {
    return StellarSdk.scValToNative(sim.result.retval) as T;
  }
  return null;
}

/** Encode a bigint (U256 field element) as a Soroban ScVal. */
export function u256(value: bigint): StellarSdk.xdr.ScVal {
  const hex = value.toString(16).padStart(64, "0");
  return StellarSdk.xdr.ScVal.scvU256(
    new StellarSdk.xdr.UInt256Parts({
      hiHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(0, 16)).toString()),
      hiLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(16, 32)).toString()),
      loHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(32, 48)).toString()),
      loLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(48, 64)).toString()),
    })
  );
}

/* ── vila-pool: read methods ────────────────────────────────────────────── */

/** `get_next_index` → number of deposits made (next Merkle leaf slot). */
export function poolGetNextIndex(poolId: string = CONTRACTS.pool): Promise<number | null> {
  return readContract<number>(poolId, "get_next_index");
}

/** `get_last_root` → current Merkle root as a hex string. */
export async function poolGetLastRoot(poolId: string = CONTRACTS.pool): Promise<string | null> {
  const root = await readContract<bigint | Buffer | Uint8Array>(poolId, "get_last_root");
  if (root == null) return null;
  if (typeof root === "bigint") return root.toString(16).padStart(64, "0");
  return Buffer.from(root).toString("hex");
}

/** `get_denomination` → fixed deposit amount (stroops) for this pool. */
export function poolGetDenomination(poolId: string = CONTRACTS.pool): Promise<bigint | null> {
  return readContract<bigint>(poolId, "get_denomination");
}

/** `is_spent` → whether a nullifier hash has already been withdrawn. */
export function poolIsSpent(
  nullifierHash: bigint,
  poolId: string = CONTRACTS.pool
): Promise<boolean | null> {
  return readContract<boolean>(poolId, "is_spent", [u256(nullifierHash)]);
}

/** `is_known_root` → whether a root is in the contract's recent-root ring buffer. */
export function poolIsKnownRoot(
  root: bigint,
  poolId: string = CONTRACTS.pool
): Promise<boolean | null> {
  return readContract<boolean>(poolId, "is_known_root", [u256(root)]);
}

/** `get_encrypted_note` → encrypted memo bytes attached to a deposit. */
export function poolGetEncryptedNote(
  leafIndex: number,
  poolId: string = CONTRACTS.pool
): Promise<Uint8Array | null> {
  return readContract<Uint8Array>(poolId, "get_encrypted_note", [
    StellarSdk.nativeToScVal(leafIndex, { type: "u32" }),
  ]);
}

/* ── groth16-verifier: read methods ─────────────────────────────────────── */

/** `num_public_inputs` → expected public-input count for the verifier's VK. */
export function verifierNumPublicInputs(
  verifierId: string = CONTRACTS.verifier
): Promise<number | null> {
  return readContract<number>(verifierId, "num_public_inputs");
}

/* ── swap-router: read methods ──────────────────────────────────────────── */

/** `get_amount_out` → quote for swapping `amountIn` of `tokenIn` → `tokenOut`. */
export function swapGetAmountOut(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  routerId: string = CONTRACTS.swapRouter
): Promise<bigint | null> {
  if (!routerId) return Promise.resolve(null);
  return readContract<bigint>(routerId, "get_amount_out", [
    StellarSdk.nativeToScVal(tokenIn, { type: "address" }),
    StellarSdk.nativeToScVal(tokenOut, { type: "address" }),
    StellarSdk.nativeToScVal(amountIn, { type: "i128" }),
  ]);
}

/* ── Aggregate live pool stats (used by the Explorer / dashboard) ───────── */

export interface PoolSnapshot {
  contractId: string;
  depositCount: number;
  denominationStroops: bigint;
  denominationHuman: number;
  lastRoot: string;
}

/** Read the full live state of a pool contract in one call. */
export async function getPoolSnapshot(poolId: string = CONTRACTS.pool): Promise<PoolSnapshot> {
  const [depositCount, denomination, lastRoot] = await Promise.all([
    poolGetNextIndex(poolId),
    poolGetDenomination(poolId),
    poolGetLastRoot(poolId),
  ]);
  const denom = denomination ?? 0n;
  return {
    contractId: poolId,
    depositCount: depositCount ?? 0,
    denominationStroops: denom,
    denominationHuman: Number(denom) / 10_000_000,
    lastRoot: lastRoot ?? "0".repeat(64),
  };
}

/* ── vila-pool: state-changing methods (deposit / withdraw) ─────────────── */

// The write paths build, simulate, sign (via Freighter or the embedded key) and
// submit their transactions with `@stellar/stellar-sdk`. They live in dedicated
// modules and are re-exported here so the entire contract surface — reads and
// writes — is reachable from this one integration module.

export { executeDeposit } from "@/lib/deposit"; // → pool `deposit`
export { executeWithdraw } from "@/lib/withdraw"; // → pool `withdraw` (Groth16 `verify`)
export { executeConfidentialTransfer } from "@/lib/confidentialTransfer";
