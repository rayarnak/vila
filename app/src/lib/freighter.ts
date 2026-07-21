"use client";

/**
 * Stellar wallet integration via the official Freighter browser extension.
 *
 * This module wraps `@stellar/freighter-api` and exposes a small, typed
 * surface for the rest of the app:
 *   - detecting whether Freighter is installed  (isConnected)
 *   - requesting connection permission           (setAllowed / requestAccess)
 *   - retrieving the connected public key         (getAddress)
 *   - signing Soroban / Stellar transactions      (signTransaction)
 *
 * All calls are dynamically imported so the extension API is only touched in
 * the browser (Freighter injects `window.freighterApi`).
 */

export interface FreighterNetwork {
  network: string;
  networkPassphrase: string;
}

async function api() {
  return import("@stellar/freighter-api");
}

/**
 * True when the Freighter extension is installed and reachable in this browser.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const { isConnected } = await api();
    const res = await isConnected();
    return Boolean(res?.isConnected) && !res.error;
  } catch {
    return false;
  }
}

/**
 * Whether the user has already granted this dApp access to Freighter.
 */
export async function isFreighterAllowed(): Promise<boolean> {
  try {
    const { isAllowed } = await api();
    const res = await isAllowed();
    return Boolean(res?.isAllowed) && !res.error;
  } catch {
    return false;
  }
}

/**
 * Connect the wallet: grant this dApp permission (setAllowed) and request the
 * account, prompting the Freighter approval popup. Returns the public key.
 */
export async function connectFreighter(): Promise<string> {
  const { setAllowed, requestAccess } = await api();

  // Grant data-sharing permission for this origin.
  const allowed = await setAllowed();
  if (allowed.error) {
    throw new Error(friendlyError(allowed.error, "Permission was declined"));
  }

  // Prompt the user to approve and return the selected account.
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error(friendlyError(access.error, "Could not read wallet address"));
  }
  return access.address;
}

/**
 * Read the currently-connected address without prompting (returns null if the
 * user has not connected yet).
 */
export async function getFreighterAddress(): Promise<string | null> {
  try {
    const { getAddress } = await api();
    const res = await getAddress();
    if (res.error || !res.address) return null;
    return res.address;
  } catch {
    return null;
  }
}

/**
 * The network Freighter is currently pointed at (testnet / public).
 */
export async function getFreighterNetwork(): Promise<FreighterNetwork | null> {
  try {
    const { getNetwork } = await api();
    const res = await getNetwork();
    if (res.error) return null;
    return { network: res.network, networkPassphrase: res.networkPassphrase };
  } catch {
    return null;
  }
}

/**
 * Sign a base64 transaction envelope XDR with Freighter and return the signed
 * envelope XDR, ready to submit to the network.
 */
export async function signWithFreighter(
  xdr: string,
  networkPassphrase: string,
  address?: string
): Promise<string> {
  const { signTransaction } = await api();
  const res = await signTransaction(xdr, { networkPassphrase, address });
  if (res.error || !res.signedTxXdr) {
    throw new Error(friendlyError(res.error, "Transaction signing was rejected"));
  }
  return res.signedTxXdr;
}

/* ── internal ─────────────────────────────────────────────── */

function friendlyError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}
