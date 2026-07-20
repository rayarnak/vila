import type { VilaNote } from "./note";
import type { MerkleTree } from "./merkle";

// snarkjs types
interface SnarkjsProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

interface SnarkjsFullProof {
  proof: SnarkjsProof;
  publicSignals: string[];
}

export interface WithdrawProofResult {
  proof: Uint8Array;
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
  publicInputs: bigint[];
  snarkjsProof: SnarkjsProof;
}

/**
 * Convert a Stellar address to a BN254 field element.
 * Matches the on-chain address_to_field function.
 */
export async function addressToField(address: string): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = encoder.encode(address);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  // Zero the top byte to fit in BN254 scalar field
  hashArray[0] = 0;
  let result = 0n;
  for (const byte of hashArray) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
}

/**
 * Generate a Groth16 withdrawal proof using snarkjs WASM.
 *
 * @param note - The VilaNote to withdraw
 * @param tree - MerkleTree containing the note's commitment
 * @param recipient - Stellar recipient address
 * @param relayer - Relayer address (or recipient if no relayer)
 * @param fee - Relayer fee
 * @param wasmPath - Path to withdraw.wasm circuit
 * @param zkeyPath - Path to withdraw_final.zkey
 */
export async function generateWithdrawProof(
  note: VilaNote,
  tree: MerkleTree,
  recipient: string,
  relayer: string,
  fee: bigint,
  wasmPath: string,
  zkeyPath: string
): Promise<WithdrawProofResult> {
  // Dynamically import snarkjs (it's a large module)
  const snarkjs = await import("snarkjs");

  // Get Merkle proof
  const { pathElements, pathIndices } = tree.getPath(note.leafIndex);

  // Convert addresses to field elements
  const recipientField = await addressToField(recipient);
  const relayerField = await addressToField(relayer);

  // Build circuit input
  const input = {
    // Public inputs
    root: tree.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: recipientField.toString(),
    relayer: relayerField.toString(),
    fee: fee.toString(),
    refund: "0",

    // Private inputs
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices,
  };

  // Generate proof
  const { proof, publicSignals }: SnarkjsFullProof =
    await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  // Convert proof points to bytes for on-chain verification
  const proofA = proofPointToG1Bytes(proof.pi_a);
  const proofB = proofPointToG2Bytes(proof.pi_b);
  const proofC = proofPointToG1Bytes(proof.pi_c);

  // Concatenated proof for convenience
  const fullProof = new Uint8Array(proofA.length + proofB.length + proofC.length);
  fullProof.set(proofA, 0);
  fullProof.set(proofB, proofA.length);
  fullProof.set(proofC, proofA.length + proofB.length);

  const publicInputs = publicSignals.map((s) => BigInt(s));

  return {
    proof: fullProof,
    proofA,
    proofB,
    proofC,
    publicInputs,
    snarkjsProof: proof,
  };
}

/**
 * Verify a proof locally using snarkjs (for testing).
 */
export async function verifyProofLocally(
  proof: SnarkjsProof,
  publicSignals: string[],
  vkeyPath: string
): Promise<boolean> {
  const snarkjs = await import("snarkjs");
  const fs = await import("fs");
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Convert a snarkjs G1 proof point [x, y, z] to 64-byte affine encoding.
 */
function proofPointToG1Bytes(point: string[]): Uint8Array {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  const result = new Uint8Array(64);
  writeBigInt(result, x, 0, 32);
  writeBigInt(result, y, 32, 32);
  return result;
}

/**
 * Convert a snarkjs G2 proof point [[x0, x1], [y0, y1], [z0, z1]] to 128-byte affine encoding.
 * snarkjs stores Fp2 as [real, imaginary]. Soroban BN254 G2 expects [c1, c0, c1, c0]
 * (imaginary first), matching the VK encoding convention in initialize-contracts.ts.
 */
function proofPointToG2Bytes(point: string[][]): Uint8Array {
  const x0 = BigInt(point[0][0]); // real part of x
  const x1 = BigInt(point[0][1]); // imaginary part of x
  const y0 = BigInt(point[1][0]); // real part of y
  const y1 = BigInt(point[1][1]); // imaginary part of y
  const result = new Uint8Array(128);
  // Soroban convention: imaginary (c1) before real (c0) for each Fp2 element
  writeBigInt(result, x1, 0, 32);  // x.c1 (imaginary)
  writeBigInt(result, x0, 32, 32); // x.c0 (real)
  writeBigInt(result, y1, 64, 32); // y.c1 (imaginary)
  writeBigInt(result, y0, 96, 32); // y.c0 (real)
  return result;
}

/**
 * Write a bigint as big-endian bytes into a Uint8Array at the given offset.
 */
function writeBigInt(
  buf: Uint8Array,
  val: bigint,
  offset: number,
  length: number
): void {
  for (let i = length - 1; i >= 0; i--) {
    buf[offset + i] = Number(val & 0xffn);
    val >>= 8n;
  }
}
