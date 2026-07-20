import { randomBytes } from "crypto";
import nacl from "tweetnacl";

export interface VilaNote {
  nullifier: bigint;
  secret: bigint;
  commitment: bigint;
  nullifierHash: bigint;
  leafIndex: number;
  amount: bigint;
  encryptedNote?: string;
}

/**
 * Generate a random field element (BN254 Fr).
 * Fr order: 21888242871839275222246405745257275088548364400416034343698204186575808495617
 */
function randomFieldElement(): bigint {
  const FR_ORDER =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const buf = randomBytes(32);
  let val = BigInt("0x" + buf.toString("hex"));
  return val % FR_ORDER;
}

/**
 * Compute Poseidon hash (BN254).
 * Uses circomlibjs for compatibility with the circom circuits.
 */
let poseidonInstance: ((inputs: bigint[]) => bigint) | null = null;

async function getPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonInstance) return poseidonInstance;
  // Dynamic import for circomlibjs
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  poseidonInstance = (inputs: bigint[]) => {
    const hash = poseidon(inputs);
    return poseidon.F.toObject(hash);
  };
  return poseidonInstance;
}

/**
 * Create a new Vila note with random nullifier and secret.
 */
export async function createNote(amount: bigint): Promise<VilaNote> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const poseidon = await getPoseidon();

  const commitment = poseidon([nullifier, secret]);
  const nullifierHash = poseidon([nullifier]);

  return {
    nullifier,
    secret,
    commitment,
    nullifierHash,
    leafIndex: -1, // Set after deposit
    amount,
  };
}

/**
 * Recompute commitment and nullifier hash from note fields.
 */
export async function recomputeNote(
  nullifier: bigint,
  secret: bigint,
  amount: bigint,
  leafIndex: number
): Promise<VilaNote> {
  const poseidon = await getPoseidon();
  const commitment = poseidon([nullifier, secret]);
  const nullifierHash = poseidon([nullifier]);

  return { nullifier, secret, commitment, nullifierHash, leafIndex, amount };
}

/**
 * Serialize a note to a compact string for QR codes.
 * Format: vila-<hex(nullifier)>-<hex(secret)>-<amount>-<leafIndex>
 */
export function serializeNote(note: VilaNote): string {
  const parts = [
    "vila",
    note.nullifier.toString(16),
    note.secret.toString(16),
    note.amount.toString(),
    note.leafIndex.toString(),
  ];
  return parts.join("-");
}

/**
 * Deserialize a note from compact string format.
 */
export async function deserializeNote(encoded: string): Promise<VilaNote> {
  const parts = encoded.split("-");
  if (parts[0] !== "vila" || parts.length !== 5) {
    throw new Error("Invalid note format");
  }

  const nullifier = BigInt("0x" + parts[1]);
  const secret = BigInt("0x" + parts[2]);
  const amount = BigInt(parts[3]);
  const leafIndex = parseInt(parts[4], 10);

  return recomputeNote(nullifier, secret, amount, leafIndex);
}

/**
 * Encrypt a note using NaCl box (x25519-xsalsa20-poly1305).
 */
export function encryptNote(
  note: VilaNote,
  recipientPubKey: Uint8Array
): Uint8Array {
  const plaintext = Buffer.from(serializeNote(note), "utf-8");
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ephemeral = nacl.box.keyPair();

  const encrypted = nacl.box(plaintext, nonce, recipientPubKey, ephemeral.secretKey);
  if (!encrypted) throw new Error("Encryption failed");

  // Format: [nonce (24 bytes)][ephemeral pubkey (32 bytes)][ciphertext]
  const result = new Uint8Array(
    nonce.length + ephemeral.publicKey.length + encrypted.length
  );
  result.set(nonce, 0);
  result.set(ephemeral.publicKey, nonce.length);
  result.set(encrypted, nonce.length + ephemeral.publicKey.length);
  return result;
}

/**
 * Decrypt a note using NaCl box.
 */
export async function decryptNote(
  encrypted: Uint8Array,
  privateKey: Uint8Array
): Promise<VilaNote> {
  const nonce = encrypted.slice(0, nacl.box.nonceLength);
  const ephemeralPub = encrypted.slice(
    nacl.box.nonceLength,
    nacl.box.nonceLength + nacl.box.publicKeyLength
  );
  const ciphertext = encrypted.slice(
    nacl.box.nonceLength + nacl.box.publicKeyLength
  );

  const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPub, privateKey);
  if (!decrypted) throw new Error("Decryption failed");

  const encoded = Buffer.from(decrypted).toString("utf-8");
  return deserializeNote(encoded);
}

export { getPoseidon };
