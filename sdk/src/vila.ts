import * as StellarSdk from "@stellar/stellar-sdk";
import { createNote, serializeNote, type VilaNote, encryptNote } from "./note";
import { MerkleTree } from "./merkle";
import { generateWithdrawProof } from "./proof";
import { RelayerClient } from "./relayer";

export interface VilaClientConfig {
  rpcUrl: string;
  networkPassphrase: string;
  poolContractId: string;
  verifierContractId: string;
  relayerUrl?: string;
  wasmPath: string;
  zkeyPath: string;
}

export interface DepositResult {
  note: VilaNote;
  noteString: string;
  txHash: string;
  leafIndex: number;
}

export interface WithdrawResult {
  txHash: string;
  nullifierHash: string;
}

/**
 * Main client for the Vila protocol.
 * Handles deposits, withdrawals, and tree synchronization.
 */
export class VilaClient {
  private config: VilaClientConfig;
  private server: StellarSdk.SorobanRpc.Server;
  private tree: MerkleTree;
  private relayer: RelayerClient | null;
  private initialized = false;

  constructor(config: VilaClientConfig) {
    this.config = config;
    this.server = new StellarSdk.SorobanRpc.Server(config.rpcUrl);
    this.tree = new MerkleTree(20);
    this.relayer = config.relayerUrl
      ? new RelayerClient(config.relayerUrl)
      : null;
  }

  /**
   * Initialize the client — builds the local Merkle tree.
   */
  async init(): Promise<void> {
    await this.tree.init();
    await this.syncTree();
    this.initialized = true;
  }

  /**
   * Deposit tokens into the pool.
   *
   * @param amount - Amount in stroops
   * @param signer - Stellar keypair for signing
   * @param recipientPubKey - Optional: encrypt note for recipient viewing key
   */
  async deposit(
    amount: bigint,
    signer: StellarSdk.Keypair,
    recipientPubKey?: Uint8Array
  ): Promise<DepositResult> {
    this.ensureInit();

    const note = await createNote(amount);

    // Build the deposit transaction
    const account = await this.server.getAccount(signer.publicKey());

    const contract = new StellarSdk.Contract(this.config.poolContractId);

    // Convert commitment to U256 bytes
    const commitmentBytes = bigintToScVal(note.commitment);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "1000000",
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "deposit",
          StellarSdk.nativeToScVal(signer.publicKey(), { type: "address" }),
          commitmentBytes
        )
      )
      .setTimeout(30)
      .build();

    // Simulate and submit
    const simulated = await this.server.simulateTransaction(tx);
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

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${sendResult.status}`);
    }

    // Wait for confirmation
    const txResult = await this.waitForTx(sendResult.hash);
    const leafIndex = this.tree.insert(note.commitment);

    note.leafIndex = leafIndex;

    // Optionally encrypt note for recipient
    if (recipientPubKey) {
      note.encryptedNote = Buffer.from(
        encryptNote(note, recipientPubKey)
      ).toString("base64");
    }

    return {
      note,
      noteString: serializeNote(note),
      txHash: sendResult.hash,
      leafIndex,
    };
  }

  /**
   * Withdraw tokens from the pool using a ZK proof.
   *
   * @param note - The VilaNote to withdraw
   * @param recipient - Stellar address to receive tokens
   * @param useRelayer - Whether to submit via relayer for additional privacy
   */
  async withdraw(
    note: VilaNote,
    recipient: string,
    useRelayer = false,
    signer?: StellarSdk.Keypair
  ): Promise<WithdrawResult> {
    this.ensureInit();

    const relayerAddress = useRelayer && this.relayer
      ? recipient // Relayer fee goes to relayer address (configured server-side)
      : recipient;
    const fee = useRelayer ? 50000000n : 0n; // 5 XLM relayer fee

    // Generate ZK proof
    const proofResult = await generateWithdrawProof(
      note,
      this.tree,
      recipient,
      relayerAddress,
      fee,
      this.config.wasmPath,
      this.config.zkeyPath
    );

    if (useRelayer && this.relayer) {
      // Submit via relayer
      const relayResult = await this.relayer.submitWithdrawal({
        proofA: Buffer.from(proofResult.proofA).toString("hex"),
        proofB: Buffer.from(proofResult.proofB).toString("hex"),
        proofC: Buffer.from(proofResult.proofC).toString("hex"),
        root: this.tree.root.toString(),
        nullifierHash: note.nullifierHash.toString(),
        recipient,
        fee: fee.toString(),
      });

      if (!relayResult.success) {
        throw new Error(`Relay failed: ${relayResult.error}`);
      }

      return {
        txHash: relayResult.txHash!,
        nullifierHash: note.nullifierHash.toString(),
      };
    }

    // Direct withdrawal (less private — links sender's IP to withdrawal)
    if (!signer) {
      throw new Error("Direct withdrawal requires a signer Keypair");
    }

    const account = await this.server.getAccount(signer.publicKey());
    const contract = new StellarSdk.Contract(this.config.poolContractId);

    const proofBytes = Buffer.concat([
      Buffer.from(proofResult.proofA),
      Buffer.from(proofResult.proofB),
      Buffer.from(proofResult.proofC),
    ]);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "10000000",
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "withdraw",
          StellarSdk.xdr.ScVal.scvBytes(proofBytes),
          bigintToScVal(this.tree.root),
          bigintToScVal(note.nullifierHash),
          StellarSdk.nativeToScVal(recipient, { type: "address" }),
          StellarSdk.nativeToScVal(relayerAddress, { type: "address" }),
          StellarSdk.nativeToScVal(fee, { type: "i128" }),
          StellarSdk.nativeToScVal(0, { type: "i128" })
        )
      )
      .setTimeout(60)
      .build();

    const simulated = await this.server.simulateTransaction(tx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simulated)) {
      throw new Error(
        `Simulation failed: ${(simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
      );
    }

    const assembled = StellarSdk.SorobanRpc.assembleTransaction(
      tx,
      simulated as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).build();
    
    assembled.sign(signer);

    const sendResult = await this.server.sendTransaction(assembled);
    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${JSON.stringify(sendResult)}`);
    }

    await this.waitForTx(sendResult.hash);

    return {
      txHash: sendResult.hash,
      nullifierHash: note.nullifierHash.toString(),
    };
  }

  /**
   * Get the size of the anonymity set (number of deposits).
   */
  async getAnonymitySet(): Promise<number> {
    return this.tree.leafCount;
  }

  /**
   * Get the current Merkle root.
   */
  getRoot(): bigint {
    return this.tree.root;
  }

  /**
   * Sync the local Merkle tree with on-chain state.
   * In production, this would read deposit events from the contract.
   */
  async syncTree(): Promise<void> {
    // For the hackathon, we sync from the API endpoint
    // In production, this would use Stellar event subscriptions
    if (!this.config.relayerUrl) return;
    try {
      const response = await fetch(
        `${this.config.relayerUrl}/tree?contract=${this.config.poolContractId}`
      );
      if (response.ok) {
        const data = (await response.json()) as { leaves?: string[] };
        if (data.leaves) {
          for (const leaf of data.leaves) {
            this.tree.insert(BigInt(leaf));
          }
        }
      }
    } catch {
      // Tree sync is best-effort during development
    }
  }

  /**
   * Wait for a transaction to be confirmed.
   */
  private async waitForTx(hash: string, maxWaitMs = 60000): Promise<StellarSdk.SorobanRpc.Api.GetTransactionResponse> {
    const start = Date.now();
    let response = await this.server.getTransaction(hash);
    while (response.status === "NOT_FOUND") {
      if (Date.now() - start > maxWaitMs) {
        throw new Error("Transaction confirmation timeout");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await this.server.getTransaction(hash);
    }
    
    if (response.status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(response)}`);
    }
    
    return response;
  }

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error("VilaClient not initialized — call init() first");
    }
  }
}

/**
 * Convert a bigint to a Soroban U256 ScVal.
 */
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
