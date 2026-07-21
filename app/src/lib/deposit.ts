/**
 * Browser-compatible deposit flow for Vila Protocol.
 *
 * Uses the Stellar SDK for transaction building/simulation/assembly,
 * but falls back to raw JSON-RPC for any step that hits
 * "Bad union switch" XDR parsing errors (protocol 26 incompatibility).
 */
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Constants ──

const FR_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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

// ── Types ──

export interface DepositResult {
  noteString: string;
  txHash: string;
  leafIndex: number;
  commitment: string;
}

// ── Helpers ──

function randomFieldElement(): bigint {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let val = 0n;
  for (const byte of buf) {
    val = (val << 8n) + BigInt(byte);
  }
  return val % FR_ORDER;
}

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

function bigintToScVal(val: bigint): StellarSdk.xdr.ScVal {
  const hex = val.toString(16).padStart(64, "0");
  const hiHi = BigInt("0x" + hex.slice(0, 16));
  const hiLo = BigInt("0x" + hex.slice(16, 32));
  const loHi = BigInt("0x" + hex.slice(32, 48));
  const loLo = BigInt("0x" + hex.slice(48, 64));

  return StellarSdk.xdr.ScVal.scvU256(
    new StellarSdk.xdr.UInt256Parts({
      hiHi: StellarSdk.xdr.Uint64.fromString(hiHi.toString()),
      hiLo: StellarSdk.xdr.Uint64.fromString(hiLo.toString()),
      loHi: StellarSdk.xdr.Uint64.fromString(loHi.toString()),
      loLo: StellarSdk.xdr.Uint64.fromString(loLo.toString()),
    })
  );
}

function serializeNote(
  nullifier: bigint,
  secret: bigint,
  amount: bigint,
  leafIndex: number
): string {
  return ["vila", nullifier.toString(16), secret.toString(16), amount.toString(), leafIndex.toString()].join("-");
}

// ── Query leaf index from contract ──

async function getNextLeafIndex(poolId?: string): Promise<number> {
  try {
    const pid = poolId || POOL_CONTRACT_ID;
    const res = await fetch(`/api/tree?poolId=${pid}`);
    if (res.ok) {
      const data = await res.json();
      return data.nextIndex ?? 0;
    }
  } catch { /* fallback below */ }

  // Fallback: call contract directly via simulation
  const contract = new StellarSdk.Contract(poolId || POOL_CONTRACT_ID);
  const source = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const dummyAccount = new StellarSdk.Account(source, "0");
  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_next_index"))
    .setTimeout(30)
    .build();

  const simRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "simulateTransaction",
      params: { transaction: tx.toEnvelope().toXDR("base64") },
    }),
  });
  const json = await simRes.json();
  const xdr = json.result?.results?.[0]?.xdr;
  if (xdr) {
    const scval = StellarSdk.xdr.ScVal.fromXDR(xdr, "base64");
    return scval.value() as number;
  }
  return 0;
}

// ── Main deposit flow ──

export async function executeDeposit(
  senderAddress: string,
  amount: bigint,
  poolContractId?: string
): Promise<DepositResult> {
  const ACTIVE_POOL = poolContractId || POOL_CONTRACT_ID;

  // Resolve the active signer (connected Freighter wallet, else embedded key).
  // The signer's address is the true transaction source, so it overrides any
  // hint passed in by the caller.
  const { getSigner } = await import("@/lib/signer");
  const signer = await getSigner();
  senderAddress = signer.address;

  // 0. Get the leaf index our deposit will occupy
  let leafIndex = await getNextLeafIndex(ACTIVE_POOL);

  // 1. Generate note secrets + Poseidon commitment
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const poseidon = await getPoseidon();
  const commitment = poseidon([nullifier, secret]);

  const contract = new StellarSdk.Contract(ACTIVE_POOL);
  const commitmentScVal = bigintToScVal(commitment);

  // 2. Load account via Horizon REST
  console.log("[deposit] step 2: loading account");
  const horizonRes = await fetch(`${HORIZON_URL}/accounts/${senderAddress}`);
  if (!horizonRes.ok) {
    throw new Error(
      horizonRes.status === 404
        ? "Account not found on testnet. Fund it first (send XLM from Freighter)."
        : `Failed to load account: ${horizonRes.status}`
    );
  }
  const horizonData = await horizonRes.json();
  const account = new StellarSdk.Account(senderAddress, String(horizonData.sequence));

  // 3. Build transaction for simulation
  console.log("[deposit] step 3: building tx");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "deposit",
        StellarSdk.nativeToScVal(senderAddress, { type: "address" }),
        commitmentScVal
      )
    )
    .setTimeout(60)
    .build();

  // 4. Simulate + assemble via SDK
  console.log("[deposit] step 4: simulating + assembling");
  const rpcServer = new StellarSdk.rpc.Server(RPC_URL);
  const simResponse = await rpcServer.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simResponse)) {
    throw new Error(
      `Simulation failed: ${(simResponse as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }
  const successSim = simResponse as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
  console.log("[deposit] simulation succeeded");

  // 5. Sign the transaction.
  //   • External wallet (Freighter): assemble the transaction and let the
  //     wallet sign the whole envelope — it handles the Soroban source-account
  //     authorization itself and shows the user a confirmation prompt.
  //   • Embedded keypair: pre-sign the Soroban auth entries, then assemble and
  //     sign the envelope locally.
  console.log(`[deposit] step 5: signing (${signer.external ? "Freighter" : "embedded"})`);
  let signedTxXdr: string;

  if (signer.external) {
    const assembled = StellarSdk.rpc.assembleTransaction(tx, successSim).build();
    signedTxXdr = await signer.signXdr(
      assembled.toEnvelope().toXDR("base64"),
      NETWORK_PASSPHRASE
    );
  } else {
    const { getActiveSecret } = await import("@/lib/noteStore");
    const walletSecret = getActiveSecret();
    if (!walletSecret) throw new Error("Wallet is locked");
    const keypair = StellarSdk.Keypair.fromSecret(walletSecret);

    // Sign auth entries before assembly
    if (successSim.result?.auth) {
      const latestLedger = (await rpcServer.getLatestLedger()).sequence;
      const signedAuth: StellarSdk.xdr.SorobanAuthorizationEntry[] = [];
      for (const authEntry of successSim.result.auth) {
        const entry = typeof authEntry === "string"
          ? StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(authEntry, "base64")
          : authEntry;
        if (entry.credentials().switch().name === "sorobanCredentialsAddress") {
          signedAuth.push(
            await StellarSdk.authorizeEntry(entry, keypair, latestLedger + 100, NETWORK_PASSPHRASE)
          );
        } else {
          signedAuth.push(entry);
        }
      }
      successSim.result.auth = signedAuth;
    }

    const assembled = StellarSdk.rpc.assembleTransaction(tx, successSim).build();
    assembled.sign(keypair);
    signedTxXdr = assembled.toEnvelope().toXDR("base64");
  }
  console.log("[deposit] step 5: signed ok");

  // 6. Submit via raw RPC
  const submitRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: { transaction: signedTxXdr },
    }),
  });
  const sendResult = (await submitRes.json()).result;

  if (!sendResult || sendResult.status === "ERROR") {
    throw new Error(
      `Transaction submission failed: ${sendResult?.errorResultXdr ?? "unknown"}`
    );
  }

  // 7. Poll for confirmation via raw RPC
  const txHash = sendResult.hash;
  const start = Date.now();
  let txStatus = "NOT_FOUND";
  let resultXdr = "";

  while (txStatus === "NOT_FOUND") {
    if (Date.now() - start > 60000) {
      throw new Error("Transaction confirmation timed out after 60s");
    }
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const pollJson = (await pollRes.json()).result;
    txStatus = pollJson?.status ?? "NOT_FOUND";
    resultXdr = pollJson?.resultXdr ?? "";

    if (txStatus === "FAILED") {
      // Try to decode the failure reason
      let reason = "Unknown reason";
      try {
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, "base64");
        reason = txResult.result().switch().name;
        const opResults = txResult.result().results();
        if (opResults?.length) {
          reason += ` / ${opResults[0].tr().switch().name}`;
        }
      } catch {
        reason = resultXdr ? `resultXdr: ${resultXdr.slice(0, 60)}...` : "no details";
      }
      throw new Error(`Transaction failed on-chain: ${reason}`);
    }
    
    if (txStatus === "SUCCESS" && pollJson?.resultMetaXdr) {
      try {
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR(pollJson.resultMetaXdr, "base64");
        const sorobanMeta = meta.v3().sorobanMeta();
        if (sorobanMeta) {
          const retVal = sorobanMeta.returnValue();
          if (retVal.switch().name === "scvU32") {
            leafIndex = retVal.u32();
          }
        }
      } catch (e) {
        console.warn("Failed to parse actual leafIndex from meta, falling back to expected index", e);
      }
    }
  }

  const noteString = serializeNote(nullifier, secret, amount, leafIndex);
  const commitmentHex = commitment.toString(16).padStart(64, "0");

  // Persist commitment to server-side store (survives RPC event pruning)
  try {
    await fetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment: commitmentHex, poolId: ACTIVE_POOL }),
    });
  } catch {
    // Non-fatal — commitment can still be recovered from on-chain events
    console.warn("Failed to persist commitment to local store");
  }

  return {
    noteString,
    txHash,
    leafIndex,
    commitment: commitmentHex,
  };
}
