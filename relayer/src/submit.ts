import * as StellarSdk from "@stellar/stellar-sdk";

export interface WithdrawParams {
  proofA: string;
  proofB: string;
  proofC: string;
  root: string;
  nullifierHash: string;
  recipient: string;
  fee: string;
}

/**
 * Submit a withdrawal transaction to Stellar on behalf of the user.
 */
export async function submitWithdrawal(
  params: WithdrawParams,
  config: {
    rpcUrl: string;
    networkPassphrase: string;
    poolContractId: string;
    signerSecret: string;
  }
): Promise<string> {
  const server = new StellarSdk.SorobanRpc.Server(config.rpcUrl);
  const signer = StellarSdk.Keypair.fromSecret(config.signerSecret);
  const account = await server.getAccount(signer.publicKey());

  const contract = new StellarSdk.Contract(config.poolContractId);

  // Build proof ScVal — must match contract's ProofData { a: BytesN<64>, b: BytesN<128>, c: BytesN<64> }
  const proofA = Buffer.from(params.proofA, "hex");
  const proofB = Buffer.from(params.proofB, "hex");
  const proofC = Buffer.from(params.proofC, "hex");

  const proof = StellarSdk.xdr.ScVal.scvMap([
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("a"),
      val: StellarSdk.nativeToScVal(proofA, { type: "bytes" }),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("b"),
      val: StellarSdk.nativeToScVal(proofB, { type: "bytes" }),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("c"),
      val: StellarSdk.nativeToScVal(proofC, { type: "bytes" }),
    }),
  ]);

  // Build the transaction
  const root = bigintToU256ScVal(BigInt(params.root));
  const nullifierHash = bigintToU256ScVal(BigInt(params.nullifierHash));
  const recipient = StellarSdk.nativeToScVal(params.recipient, { type: "address" });
  const relayer = StellarSdk.nativeToScVal(signer.publicKey(), { type: "address" });
  const fee = StellarSdk.nativeToScVal(BigInt(params.fee), { type: "i128" });
  const refund = StellarSdk.nativeToScVal(0n, { type: "i128" });

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "withdraw",
        proof,
        root,
        nullifierHash,
        recipient,
        relayer,
        fee,
        refund
      )
    )
    .setTimeout(60)
    .build();

  // Simulate
  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  // Assemble and sign
  const prepared = StellarSdk.SorobanRpc.assembleTransaction(
    tx,
    simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();
  prepared.sign(signer);

  // Submit
  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === "ERROR") {
    throw new Error(`Submit failed: ${sendResult.status}`);
  }

  // Wait for confirmation
  let getResult = await server.getTransaction(sendResult.hash);
  let attempts = 0;
  while (getResult.status === "NOT_FOUND") {
    if (attempts++ > 60) {
      throw new Error("Transaction confirmation timeout");
    }
    await new Promise((r) => setTimeout(r, 1000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error("Transaction failed on-chain");
  }

  return sendResult.hash;
}

export interface SwapWithdrawParams extends WithdrawParams {
  tokenOut: string;
  minAmountOut: string;
}

/**
 * Submit a swap withdrawal transaction — withdraw from the pool and swap to a different token.
 */
export async function submitSwapWithdrawal(
  params: SwapWithdrawParams,
  config: {
    rpcUrl: string;
    networkPassphrase: string;
    poolContractId: string;
    signerSecret: string;
  }
): Promise<string> {
  const server = new StellarSdk.SorobanRpc.Server(config.rpcUrl);
  const signer = StellarSdk.Keypair.fromSecret(config.signerSecret);
  const account = await server.getAccount(signer.publicKey());

  const contract = new StellarSdk.Contract(config.poolContractId);

  const proofA = Buffer.from(params.proofA, "hex");
  const proofB = Buffer.from(params.proofB, "hex");
  const proofC = Buffer.from(params.proofC, "hex");

  const proof = StellarSdk.xdr.ScVal.scvMap([
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("a"),
      val: StellarSdk.nativeToScVal(proofA, { type: "bytes" }),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("b"),
      val: StellarSdk.nativeToScVal(proofB, { type: "bytes" }),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("c"),
      val: StellarSdk.nativeToScVal(proofC, { type: "bytes" }),
    }),
  ]);

  const root = bigintToU256ScVal(BigInt(params.root));
  const nullifierHash = bigintToU256ScVal(BigInt(params.nullifierHash));
  const recipient = StellarSdk.nativeToScVal(params.recipient, { type: "address" });
  const relayer = StellarSdk.nativeToScVal(signer.publicKey(), { type: "address" });
  const fee = StellarSdk.nativeToScVal(BigInt(params.fee), { type: "i128" });
  const refund = StellarSdk.nativeToScVal(0n, { type: "i128" });
  const tokenOut = StellarSdk.nativeToScVal(params.tokenOut, { type: "address" });
  const minAmountOut = StellarSdk.nativeToScVal(BigInt(params.minAmountOut), { type: "i128" });

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "withdraw_swap",
        proof,
        root,
        nullifierHash,
        recipient,
        relayer,
        fee,
        refund,
        tokenOut,
        minAmountOut
      )
    )
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(
      `Simulation failed: ${(simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
    );
  }

  const prepared = StellarSdk.SorobanRpc.assembleTransaction(
    tx,
    simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();
  prepared.sign(signer);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === "ERROR") {
    throw new Error(`Submit failed: ${sendResult.status}`);
  }

  let getResult = await server.getTransaction(sendResult.hash);
  let attempts = 0;
  while (getResult.status === "NOT_FOUND") {
    if (attempts++ > 60) {
      throw new Error("Transaction confirmation timeout");
    }
    await new Promise((r) => setTimeout(r, 1000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status === "FAILED") {
    throw new Error("Transaction failed on-chain");
  }

  return sendResult.hash;
}

function bigintToU256ScVal(val: bigint): StellarSdk.xdr.ScVal {
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
