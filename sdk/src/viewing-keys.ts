import nacl from "tweetnacl";
import { randomBytes } from "crypto";
import type { VilaNote } from "./note";

export interface ViewingKeyPair {
  viewingKey: Uint8Array;
  spendingKey: Uint8Array;
  viewingPubKey: Uint8Array;
}

export interface TimelockEnvelope {
  encryptedData: string; // base64
  timelockUntil: number; // Unix timestamp (seconds)
  viewingPubKey: string; // hex
  nonce: string; // hex
}

/**
 * Derive a viewing key pair from a seed.
 * The viewing key can decrypt transaction data.
 * The spending key is needed to withdraw.
 */
export function deriveViewingKey(seed: Uint8Array): ViewingKeyPair {
  // Use the seed to derive two keypairs
  // viewing = nacl.box.keyPair.fromSecretKey(sha256(seed + "viewing"))
  // spending = nacl.box.keyPair.fromSecretKey(sha256(seed + "spending"))

  const viewingHash = sha256Sync(
    Buffer.concat([seed, Buffer.from("viewing")])
  );
  const spendingHash = sha256Sync(
    Buffer.concat([seed, Buffer.from("spending")])
  );

  const viewingKeyPair = nacl.box.keyPair.fromSecretKey(viewingHash);

  return {
    viewingKey: viewingHash,
    spendingKey: spendingHash,
    viewingPubKey: viewingKeyPair.publicKey,
  };
}

/**
 * Encrypt a note for viewing key recovery with a timelock.
 *
 * The note data is encrypted with the viewing key's public key.
 * The timelockSeconds determines when the note becomes decryptable.
 * Before the timelock expires, decryption attempts return "LOCKED".
 */
export function encryptNoteForViewing(
  note: VilaNote,
  viewingPubKey: Uint8Array,
  timelockSeconds: number
): TimelockEnvelope {
  const now = Math.floor(Date.now() / 1000);
  const timelockUntil = now + timelockSeconds;

  // Serialize note data with timelock
  const payload = JSON.stringify({
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    amount: note.amount.toString(),
    leafIndex: note.leafIndex,
    timelockUntil,
  });

  const plaintext = Buffer.from(payload, "utf-8");
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ephemeral = nacl.box.keyPair();

  const encrypted = nacl.box(plaintext, nonce, viewingPubKey, ephemeral.secretKey);
  if (!encrypted) throw new Error("Encryption failed");

  // Combine ephemeral pubkey + ciphertext
  const combined = new Uint8Array(ephemeral.publicKey.length + encrypted.length);
  combined.set(ephemeral.publicKey, 0);
  combined.set(encrypted, ephemeral.publicKey.length);

  return {
    encryptedData: Buffer.from(combined).toString("base64"),
    timelockUntil,
    viewingPubKey: Buffer.from(viewingPubKey).toString("hex"),
    nonce: Buffer.from(nonce).toString("hex"),
  };
}

/**
 * Decrypt a timelocked note with a viewing key.
 * Returns the note if the timelock has expired, or "LOCKED" if still locked.
 */
export async function decryptWithViewingKey(
  envelope: TimelockEnvelope,
  viewingKey: Uint8Array
): Promise<VilaNote | "LOCKED"> {
  const now = Math.floor(Date.now() / 1000);

  if (now < envelope.timelockUntil) {
    return "LOCKED";
  }

  const combined = Buffer.from(envelope.encryptedData, "base64");
  const nonce = Buffer.from(envelope.nonce, "hex");
  const ephemeralPub = combined.slice(0, nacl.box.publicKeyLength);
  const ciphertext = combined.slice(nacl.box.publicKeyLength);

  const decrypted = nacl.box.open(
    new Uint8Array(ciphertext),
    new Uint8Array(nonce),
    new Uint8Array(ephemeralPub),
    viewingKey
  );

  if (!decrypted) throw new Error("Decryption failed — wrong viewing key");

  const payload = JSON.parse(Buffer.from(decrypted).toString("utf-8"));

  const { recomputeNote } = await import("./note");

  return recomputeNote(
    BigInt(payload.nullifier),
    BigInt(payload.secret),
    BigInt(payload.amount),
    payload.leafIndex
  );
}

/**
 * Get the time remaining on a timelock envelope.
 */
export function getTimelockRemaining(envelope: TimelockEnvelope): {
  locked: boolean;
  secondsRemaining: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, envelope.timelockUntil - now);
  return {
    locked: remaining > 0,
    secondsRemaining: remaining,
  };
}

/**
 * Simple sync SHA-256 using Node.js crypto.
 */
function sha256Sync(data: Buffer): Uint8Array {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update(data).digest();
  return new Uint8Array(hash);
}
