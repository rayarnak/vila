/**
 * Confidential Pay — direct Stellar payment with exact amounts.
 *
 * Currently executes a standard Stellar payment operation.
 * Architecture is ready to swap in ElGamal-encrypted transfers
 * when a confidential token contract is deployed on Soroban.
 */
import * as StellarSdk from "@stellar/stellar-sdk";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://soroban-testnet.stellar.org";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

export type ConfidentialProgressCallback = (step: string) => void;

export interface ConfidentialTransferResult {
  txHash: string;
}

export async function executeConfidentialTransfer(
  recipientAddress: string,
  amount: bigint,
  tokenSymbol: string,
  onProgress?: ConfidentialProgressCallback
): Promise<ConfidentialTransferResult> {
  const progress = onProgress ?? (() => { });

  // 1. Load sender address from embedded keypair
  progress("Preparing transfer...");
  const { getStellarAddress, signTransactionXdr } = await import(
    "@/lib/noteStore"
  );
  const senderAddress = getStellarAddress();
  if (!senderAddress) throw new Error("Wallet not initialized");

  // 2. Load sender account from Horizon
  const horizonRes = await fetch(
    `${HORIZON_URL}/accounts/${senderAddress}`
  );
  if (!horizonRes.ok) {
    throw new Error(
      horizonRes.status === 404
        ? "Account not found. Fund your wallet first."
        : `Failed to load account: ${horizonRes.status}`
    );
  }
  const horizonData = await horizonRes.json();
  const account = new StellarSdk.Account(senderAddress, horizonData.sequence);

  // 3. Build payment operation
  progress("Signing...");
  const isNative = tokenSymbol === "XLM";

  // Convert stroops to decimal string (7 decimal places)
  const scale = 10n ** 7n;
  const whole = amount / scale;
  const frac = amount % scale;
  const amountStr =
    frac === 0n
      ? whole.toString()
      : `${whole}.${frac.toString().padStart(7, "0").replace(/0+$/, "")}`;

  const asset = isNative
    ? StellarSdk.Asset.native()
    : new StellarSdk.Asset(tokenSymbol, getAssetIssuer(tokenSymbol));

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: recipientAddress,
        asset,
        amount: amountStr,
      })
    )
    .setTimeout(60)
    .build();

  const signedXdr = signTransactionXdr(
    tx.toEnvelope().toXDR("base64"),
    NETWORK_PASSPHRASE
  );

  // 4. Submit
  progress("Submitting...");
  const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(signedXdr)}`,
  });

  const submitData = await submitRes.json();

  if (!submitRes.ok) {
    const detail =
      submitData?.extras?.result_codes?.operations?.[0] ??
      submitData?.extras?.result_codes?.transaction ??
      submitData?.title ??
      "unknown error";
    throw new Error(`Transaction failed: ${detail}`);
  }

  // 5. Confirmed
  progress("Confirming...");
  return { txHash: submitData.hash };
}

function getAssetIssuer(symbol: string): string {
  // Well-known issuers on Stellar public network
  const issuers: Record<string, string> = {
    USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    USDT: "GCQTGZQQ5G4PTM2GL7CDIFKUBBER43FNBJ6DZFKZAVXYSB5SJHXNCQGS",
  };
  const issuer = issuers[symbol];
  if (!issuer) throw new Error(`Unknown asset issuer for ${symbol}`);
  return issuer;
}
