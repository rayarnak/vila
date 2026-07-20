/**
 * Stellar Soroban RPC helpers for querying pool contract state.
 */

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ||
  process.env.STELLAR_RPC_URL ||
  "https://soroban-testnet.stellar.org";

const POOL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID || "";

/**
 * Simulate a read-only contract invocation via raw Soroban RPC.
 * Returns the raw xdr result on success.
 */
async function simulateInvoke(
  contractId: string,
  method: string
): Promise<string | null> {
  // Build a minimal InvokeHostFunction XDR.
  // We use the Stellar SDK on the server side for proper XDR construction.
  const StellarSdk = await import("@stellar/stellar-sdk");
  const server = new StellarSdk.rpc.Server(RPC_URL);

  // Use a dummy source for simulation (no signing needed)
  const dummySource =
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const account = new StellarSdk.Account(dummySource, "0");

  const contract = new StellarSdk.Contract(contractId);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);

  if (
    StellarSdk.rpc.Api.isSimulationSuccess(sim) &&
    sim.result
  ) {
    return sim.result.retval.toXDR("base64");
  }
  return null;
}

export interface PoolStats {
  contractId: string;
  depositCount: number;
  denomination: string;
  denominationXLM: number;
  lastRoot: string;
  tokenId: string;
  network: string;
}

/**
 * Fetch live pool stats from the Soroban contract.
 */
export async function getPoolStats(
  contractId?: string
): Promise<PoolStats> {
  const id = contractId || POOL_CONTRACT_ID;
  if (!id) {
    throw new Error("No pool contract ID configured");
  }

  const StellarSdk = await import("@stellar/stellar-sdk");

  // Query get_next_index
  const nextIndexXdr = await simulateInvoke(id, "get_next_index");
  let depositCount = 0;
  if (nextIndexXdr) {
    const val = StellarSdk.xdr.ScVal.fromXDR(nextIndexXdr, "base64");
    depositCount = val.u32() ?? 0;
  }

  // Query get_denomination
  const denomXdr = await simulateInvoke(id, "get_denomination");
  let denomination = "0";
  let denominationXLM = 0;
  if (denomXdr) {
    const val = StellarSdk.xdr.ScVal.fromXDR(denomXdr, "base64");
    const i128 = val.i128();
    const loHex = i128.lo().toXDR("hex");
    const hiHex = i128.hi().toXDR("hex");
    const lo = BigInt("0x" + loHex);
    const hi = BigInt("0x" + hiHex);
    const raw = (hi << BigInt(64)) | lo;
    denomination = raw.toString();
    denominationXLM = Number(raw) / 10_000_000;
  }

  // Query get_last_root
  const rootXdr = await simulateInvoke(id, "get_last_root");
  let lastRoot = "0";
  if (rootXdr) {
    const val = StellarSdk.xdr.ScVal.fromXDR(rootXdr, "base64");
    // U256 comes back as bytes
    const rootBytes = val.bytes?.() || val.value();
    if (rootBytes && rootBytes.length > 0) {
      lastRoot = Buffer.from(rootBytes).toString("hex").slice(0, 16) + "...";
    }
  }

  return {
    contractId: id,
    depositCount,
    denomination,
    denominationXLM,
    lastRoot,
    tokenId: process.env.TOKEN_CONTRACT_ID || process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID || "",
    network: "testnet",
  };
}
