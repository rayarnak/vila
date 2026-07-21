"use client";

import { useEffect, useState } from "react";
import {
  connectFreighter,
  getFreighterAddress,
  isFreighterAllowed,
} from "@/lib/freighter";

/**
 * Tracks the externally-connected Stellar wallet (Freighter) address across the
 * app. The address is persisted to localStorage so the connection survives page
 * navigations, and changes are broadcast via a custom event so every mounted
 * `useWalletConnection()` hook stays in sync.
 */

const STORAGE_KEY = "vila_connected_wallet";
const EVENT = "vila:wallet-connection";

export function getConnectedAddress(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function setConnectedAddress(address: string | null) {
  if (typeof window === "undefined") return;
  if (address) {
    window.localStorage.setItem(STORAGE_KEY, address);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: address }));
}

/**
 * React hook exposing the connected wallet address plus connect/disconnect
 * actions. Components re-render whenever the connection changes anywhere.
 */
export function useWalletConnection() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Hydrate from storage, then confirm the permission is still valid.
    const stored = getConnectedAddress();
    if (stored) setAddress(stored);

    (async () => {
      if (stored && (await isFreighterAllowed())) {
        const live = await getFreighterAddress();
        if (live && live !== stored) {
          setConnectedAddress(live);
        } else if (!live) {
          // Permission was revoked in the extension — clear stale state.
          setConnectedAddress(null);
        }
      }
    })();

    const onChange = (e: Event) => {
      setAddress((e as CustomEvent<string | null>).detail ?? null);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectFreighter();
      setConnectedAddress(addr);
      setAddress(addr);
      return addr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect wallet";
      setError(msg);
      throw e;
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setConnectedAddress(null);
    setAddress(null);
  };

  return { address, connecting, error, connect, disconnect };
}
