"use client";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import nacl from "tweetnacl";

/* ── Data Model ─────────────────────────────────────────────── */

export interface StoredNote {
  id: string;
  noteString: string;      // vila-<nullifier>-<secret>-<denom>-<leafIndex>
  token: string;           // "XLM" | "USDC"
  amountDisplay: string;   // "100 XLM"
  amountRaw: string;       // "1000000000"
  createdAt: number;
  txHash: string;
  status: "unspent" | "spent" | "pending" | "shared";
  spentTxHash?: string;
  spentAt?: number;
  sharedAt?: number;
}

export interface WalletData {
  pinHash: string;
  notes: StoredNote[];
  createdAt: number;
  stellarPublicKey?: string;
  encryptedSecretKey?: string;
  encryptionSalt?: string;
}

export const STORAGE_KEY = "vila_wallet_v1";

/* ── Helpers ────────────────────────────────────────────────── */

function hash(input: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

function encode(data: WalletData): string {
  return btoa(JSON.stringify(data));
}

function decode(raw: string): WalletData {
  return JSON.parse(atob(raw));
}

export function loadRaw(): WalletData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return decode(raw);
  } catch {
    return null;
  }
}

function save(data: WalletData) {
  localStorage.setItem(STORAGE_KEY, encode(data));
}

let unlocked = false;
let activePin: string | null = null;
let onMutationCb: (() => void) | null = null;

export function setOnMutation(cb: (() => void) | null) {
  onMutationCb = cb;
}

export function getActivePin(): string | null {
  return activePin;
}

export function getActiveSecret(): string | null {
  return activeSecret;
}

/* ── Keypair encryption helpers ────────────────────────────── */

function deriveKey(pin: string, saltHex: string): Uint8Array {
  const salt = hexToBytes(saltHex);
  const input = new TextEncoder().encode(pin);
  const combined = new Uint8Array(input.length + salt.length);
  combined.set(input);
  combined.set(salt, input.length);
  return sha256(combined); // 32 bytes — fits secretbox key
}

function encryptSecret(secret: string, pin: string, saltHex: string): string {
  const key = deriveKey(pin, saltHex);
  const nonce = nacl.randomBytes(24);
  const plaintext = new TextEncoder().encode(secret);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);
  // Prepend nonce to ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return btoa(String.fromCharCode(...combined));
}

function decryptSecret(encrypted: string, pin: string, saltHex: string): string {
  const key = deriveKey(pin, saltHex);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
  if (!plaintext) throw new Error("Decryption failed — wrong PIN");
  return new TextDecoder().decode(plaintext);
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/* ── In-memory active keypair ──────────────────────────────── */

// We store the Stellar secret (S...) while unlocked and lazily create Keypair
let activeSecret: string | null = null;

function getKeypairModule(): typeof import("@stellar/stellar-sdk") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@stellar/stellar-sdk");
}

/* ── Public API ─────────────────────────────────────────────── */

export function isWalletInitialized(): boolean {
  return loadRaw() !== null;
}

export function initWallet(pin: string): boolean {
  if (isWalletInitialized()) return false;

  const sdk = getKeypairModule();
  const keypair = sdk.Keypair.random();
  const salt = generateSalt();

  const data: WalletData = {
    pinHash: hash(pin),
    notes: [],
    createdAt: Date.now(),
    stellarPublicKey: keypair.publicKey(),
    encryptedSecretKey: encryptSecret(keypair.secret(), pin, salt),
    encryptionSalt: salt,
  };
  save(data);
  activeSecret = keypair.secret();
  activePin = pin;
  unlocked = true;
  return true;
}

export function unlockWallet(pin: string): boolean {
  const data = loadRaw();
  if (!data) return false;
  if (data.pinHash !== hash(pin)) return false;

  // Migration: generate keypair if wallet was created before this feature
  if (!data.encryptedSecretKey) {
    const sdk = getKeypairModule();
    const keypair = sdk.Keypair.random();
    const salt = generateSalt();
    data.stellarPublicKey = keypair.publicKey();
    data.encryptedSecretKey = encryptSecret(keypair.secret(), pin, salt);
    data.encryptionSalt = salt;
    save(data);
    activeSecret = keypair.secret();
  } else {
    activeSecret = decryptSecret(data.encryptedSecretKey, pin, data.encryptionSalt!);
  }

  activePin = pin;
  unlocked = true;
  return true;
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function lockWallet() {
  activeSecret = null;
  activePin = null;
  unlocked = false;
}

/**
 * Returns the Stellar G... public key from storage (no PIN needed).
 */
export function getStellarAddress(): string | null {
  const data = loadRaw();
  return data?.stellarPublicKey ?? null;
}

/**
 * Sign a Soroban transaction XDR with the embedded keypair.
 * Returns the signed XDR string ready for submission.
 */
export function signTransactionXdr(envelopeXdr: string, networkPassphrase: string): string {
  if (!activeSecret) throw new Error("Wallet is locked");
  const sdk = getKeypairModule();
  const keypair = sdk.Keypair.fromSecret(activeSecret);
  const tx = sdk.TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  tx.sign(keypair);
  return tx.toEnvelope().toXDR("base64");
}

export function addNote(note: Omit<StoredNote, "id" | "createdAt" | "status">): StoredNote {
  const data = loadRaw();
  if (!data) throw new Error("Wallet not initialized");
  const stored: StoredNote = {
    ...note,
    id: hash(note.noteString).slice(0, 16),
    createdAt: Date.now(),
    status: "unspent",
  };
  data.notes.push(stored);
  save(data);
  onMutationCb?.();
  return stored;
}

export function markSpent(noteId: string, txHash: string) {
  const data = loadRaw();
  if (!data) return;
  const note = data.notes.find((n) => n.id === noteId);
  if (note) {
    note.status = "spent";
    note.spentTxHash = txHash;
    note.spentAt = Date.now();
    save(data);
    onMutationCb?.();
  }
}

export function markShared(noteId: string) {
  const data = loadRaw();
  if (!data) return;
  const note = data.notes.find((n) => n.id === noteId);
  if (note) {
    note.status = "shared";
    note.sharedAt = Date.now();
    save(data);
    onMutationCb?.();
  }
}

export function getUnspentNotes(token?: string): StoredNote[] {
  const data = loadRaw();
  if (!data) return [];
  return data.notes.filter(
    (n) => (n.status === "unspent" || n.status === "shared") && (!token || n.token === token)
  );
}

export function getBalance(token?: string): { total: bigint; display: string } {
  const notes = getUnspentNotes(token);
  const total = notes.reduce((sum, n) => sum + BigInt(n.amountRaw), 0n);
  // Build display from token groups
  if (token) {
    return { total, display: formatAmount(total, token) };
  }
  const byToken: Record<string, bigint> = {};
  for (const n of notes) {
    byToken[n.token] = (byToken[n.token] ?? 0n) + BigInt(n.amountRaw);
  }
  const parts = Object.entries(byToken).map(([t, amt]) => formatAmount(amt, t));
  return { total, display: parts.join(" + ") || "0" };
}

function formatAmount(raw: bigint, token: string): string {
  const scale = 10n ** 7n; // Stellar 7 decimals
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) return `${whole} ${token}`;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} ${token}`;
}

export function getAllActivity(): StoredNote[] {
  const data = loadRaw();
  if (!data) return [];
  return [...data.notes].sort((a, b) => b.createdAt - a.createdAt);
}

export function selectNoteForAmount(
  token: string,
  amountRaw: string
): StoredNote | null {
  const notes = getUnspentNotes(token);
  const target = BigInt(amountRaw);
  // Exact match — prefer newest (most recently deposited)
  const exacts = notes
    .filter((n) => BigInt(n.amountRaw) === target)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (exacts.length > 0) return exacts[0];
  // Smallest sufficient note
  const sufficient = notes
    .filter((n) => BigInt(n.amountRaw) >= target)
    .sort((a, b) => {
      const diff = BigInt(a.amountRaw) - BigInt(b.amountRaw);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    });
  return sufficient[0] ?? null;
}

export function addConfidentialTransfer(
  token: string,
  amount: string,
  recipient: string,
  txHash: string
): StoredNote {
  const data = loadRaw();
  if (!data) throw new Error("Wallet not initialized");
  const id = hash(`conf-${txHash}`).slice(0, 16);
  const scale = 10n ** 7n;
  const raw = BigInt(amount);
  const whole = raw / scale;
  const frac = raw % scale;
  const displayAmt =
    frac === 0n
      ? `${whole}`
      : `${whole}.${frac.toString().padStart(7, "0").replace(/0+$/, "")}`;

  const stored: StoredNote = {
    id,
    noteString: `confidential-${recipient.slice(0, 8)}-${txHash.slice(0, 12)}`,
    token,
    amountDisplay: `${displayAmt} ${token}`,
    amountRaw: amount,
    createdAt: Date.now(),
    txHash,
    status: "spent",
    spentTxHash: txHash,
    spentAt: Date.now(),
  };
  data.notes.push(stored);
  save(data);
  onMutationCb?.();
  return stored;
}

export function exportWallet(): string {
  const data = loadRaw();
  if (!data) throw new Error("No wallet to export");
  return JSON.stringify(data.notes, null, 2);
}

export function importWallet(json: string, pin: string): number {
  const notes: StoredNote[] = JSON.parse(json);
  if (!Array.isArray(notes)) throw new Error("Invalid wallet export");
  let data = loadRaw();
  if (!data) {
    initWallet(pin);
    data = loadRaw()!;
  }
  let added = 0;
  for (const note of notes) {
    const exists = data.notes.some((n) => n.noteString === note.noteString);
    if (!exists) {
      data.notes.push(note);
      added++;
    }
  }
  save(data);
  return added;
}

export function resetWallet() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  activeSecret = null;
  activePin = null;
  unlocked = false;
}

/**
 * Generate a deterministic viewing key for a note.
 * The key can decrypt transaction details after a timelock expires,
 * but cannot spend the note's funds.
 *
 * In production this would use NaCl box + timelock encryption.
 * For the demo, we derive a deterministic key from the note + a viewer salt.
 */
export function generateViewingKey(noteId: string, timelockHours: number = 24): {
  viewingKey: string;
  timelockHours: number;
  expiresAt: number;
} {
  const data = loadRaw();
  if (!data) throw new Error("Wallet not initialized");
  const note = data.notes.find((n) => n.id === noteId);
  if (!note) throw new Error("Note not found");

  // Derive a deterministic viewing key from the note string + salt
  const salt = "vila-viewing-key-v1";
  const input = new TextEncoder().encode(salt + note.noteString + timelockHours);
  const hash = sha256(input);
  const vk = "vk-" + bytesToHex(hash).slice(0, 48);

  return {
    viewingKey: vk,
    timelockHours,
    expiresAt: Date.now() + timelockHours * 60 * 60 * 1000,
  };
}
