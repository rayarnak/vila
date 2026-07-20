"use client";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import nacl from "tweetnacl";
import {
  STORAGE_KEY,
  type WalletData,
  loadRaw,
  getActivePin,
  setOnMutation,
} from "./noteStore";

/* ── Constants ──────────────────────────────────────────── */

const VAULT_USERNAME_KEY = "vila_vault_username";
const VAULT_PREFIX = "vila-vault-v1:";

/* ── Identifier ─────────────────────────────────────────── */

export function vaultIdentifier(username: string): string {
  const input = new TextEncoder().encode(VAULT_PREFIX + username);
  return bytesToHex(sha256(input));
}

/* ── Key derivation (PBKDF2, 200k iterations) ──────────── */

const PBKDF2_ITERATIONS = 200_000;

async function deriveKey(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256 // 32 bytes
  );
  return new Uint8Array(bits);
}

/* ── Auth token (prevents unauthenticated overwrites) ──── */

async function deriveAuthToken(username: string, pin: string): Promise<string> {
  const salt = new TextEncoder().encode("vila-vault-auth:" + username);
  const token = await deriveKey(pin, salt);
  return bytesToHex(token);
}

/* ── Encrypt / Decrypt ──────────────────────────────────── */

export async function encryptVault(walletJson: string, pin: string): Promise<string> {
  const salt = nacl.randomBytes(16);
  const key = await deriveKey(pin, salt);

  const nonce = nacl.randomBytes(24);
  const plaintext = new TextEncoder().encode(walletJson);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  // Layout: salt(16) + nonce(24) + ciphertext
  const blob = new Uint8Array(16 + 24 + ciphertext.length);
  blob.set(salt, 0);
  blob.set(nonce, 16);
  blob.set(ciphertext, 40);
  return btoa(String.fromCharCode(...blob));
}

export async function decryptVault(blob: string, pin: string): Promise<string> {
  const data = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const salt = data.slice(0, 16);
  const nonce = data.slice(16, 40);
  const ciphertext = data.slice(40);

  const key = await deriveKey(pin, salt);

  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
  if (!plaintext) throw new Error("Wrong PIN or corrupted vault");
  return new TextDecoder().decode(plaintext);
}

/* ── Save / Load ────────────────────────────────────────── */

export async function saveVault(username: string, pin: string): Promise<void> {
  const data = loadRaw();
  if (!data) throw new Error("No wallet data to save");

  const walletJson = JSON.stringify(data);
  const identifierHash = vaultIdentifier(username);
  const [encryptedVault, authToken] = await Promise.all([
    encryptVault(walletJson, pin),
    deriveAuthToken(username, pin),
  ]);

  const res = await fetch("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", identifierHash, encryptedVault, authToken }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vault save failed: ${body}`);
  }

  localStorage.setItem(VAULT_USERNAME_KEY, username);
}

export async function loadVault(
  username: string,
  pin: string
): Promise<boolean> {
  const identifierHash = vaultIdentifier(username);

  const res = await fetch("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "load", identifierHash }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vault load failed: ${body}`);
  }

  const { found, encryptedVault } = await res.json();
  if (!found) return false;

  const walletJson = await decryptVault(encryptedVault, pin);
  const walletData: WalletData = JSON.parse(walletJson);

  // Write to localStorage
  localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(walletData)));
  localStorage.setItem(VAULT_USERNAME_KEY, username);
  return true;
}

/* ── Username helpers ───────────────────────────────────── */

export function getVaultUsername(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(VAULT_USERNAME_KEY);
}

export function clearVaultUsername() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(VAULT_USERNAME_KEY);
  }
}

/* ── Auto-sync ──────────────────────────────────────────── */

let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export function initAutoSync() {
  setOnMutation(() => {
    const username = getVaultUsername();
    const pin = getActivePin();
    if (!username || !pin) return;

    // Debounce: wait 2s after last mutation before syncing
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      saveVault(username, pin).catch((err) =>
        console.warn("[vault] auto-sync failed:", err)
      );
    }, 2000);
  });
}
