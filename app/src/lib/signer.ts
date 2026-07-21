"use client";

import { getConnectedAddress } from "@/lib/walletConnection";
import { signWithFreighter } from "@/lib/freighter";

/**
 * A signing strategy used by the deposit / withdraw flows.
 *
 * Two implementations exist:
 *   1. Freighter (external wallet) — preferred whenever a wallet is connected.
 *      The user reviews and signs every transaction in the extension, and the
 *      wallet handles Soroban source-account authorization itself.
 *   2. Embedded keypair (legacy custodial fallback) — used only when no
 *      external wallet is connected, so existing PIN-based wallets keep working.
 */
export interface TxSigner {
  /** The Stellar public key (G...) that will be the transaction source. */
  address: string;
  /** Sign a base64 transaction envelope XDR and return the signed XDR. */
  signXdr: (envelopeXdr: string, networkPassphrase: string) => Promise<string>;
  /**
   * When true, the wallet handles Soroban auth entries during signing, so the
   * caller must NOT pre-sign auth entries — it should simply assemble the
   * transaction and hand the whole envelope to `signXdr`.
   */
  external: boolean;
}

/**
 * Resolve the active signer. Prefers a connected Freighter wallet; otherwise
 * falls back to the embedded (PIN-encrypted) keypair.
 */
export async function getSigner(): Promise<TxSigner> {
  const connected = getConnectedAddress();
  if (connected) {
    return {
      address: connected,
      external: true,
      signXdr: (xdr, networkPassphrase) =>
        signWithFreighter(xdr, networkPassphrase, connected),
    };
  }

  // Fallback: embedded keypair from the local encrypted store.
  const { getStellarAddress, signTransactionXdr } = await import("@/lib/noteStore");
  const address = getStellarAddress();
  if (!address) {
    throw new Error(
      "No wallet connected. Connect Freighter or unlock your embedded wallet."
    );
  }
  return {
    address,
    external: false,
    signXdr: async (xdr, networkPassphrase) =>
      signTransactionXdr(xdr, networkPassphrase),
  };
}
