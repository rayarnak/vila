/**
 * Generate a valid circuit input with a consistent Merkle tree.
 * Usage: npx tsx scripts/generate-valid-input.ts
 */

import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("=== Generating valid circuit input ===\n");

  // Import circomlibjs for Poseidon hashing
  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Pick random nullifier and secret
  const nullifier = BigInt("314159265358979323846264338327950288419716939937510");
  const secret = BigInt("271828182845904523536028747135266249775724709369995");

  // Compute commitment = Poseidon(nullifier, secret)
  const commitment = F.toObject(poseidon([nullifier, secret]));
  console.log("Commitment:", commitment.toString());

  // Compute nullifierHash = Poseidon(nullifier)
  const nullifierHash = F.toObject(poseidon([nullifier]));
  console.log("NullifierHash:", nullifierHash.toString());

  // Build a minimal Merkle tree of depth 20
  const DEPTH = 20;

  // Compute zero values at each level
  const zeros: bigint[] = [BigInt(0)];
  for (let i = 1; i <= DEPTH; i++) {
    zeros[i] = F.toObject(poseidon([zeros[i - 1], zeros[i - 1]]));
  }

  // Insert commitment at index 0
  const leafIndex = 0;
  let currentHash = commitment;
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let currentIndex = leafIndex;
  for (let i = 0; i < DEPTH; i++) {
    if (currentIndex % 2 === 0) {
      // Leaf is on the left, sibling is the zero value at this level
      pathElements.push(zeros[i]);
      pathIndices.push(0);
      currentHash = F.toObject(poseidon([currentHash, zeros[i]]));
    } else {
      // Leaf is on the right — shouldn't happen for index 0
      pathElements.push(zeros[i]);
      pathIndices.push(1);
      currentHash = F.toObject(poseidon([zeros[i], currentHash]));
    }
    currentIndex = Math.floor(currentIndex / 2);
  }

  const root = currentHash;
  console.log("Root:", root.toString());

  // Build the input JSON
  const input = {
    root: root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: "1234567890",
    relayer: "0",
    fee: "0",
    refund: "0",
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices,
  };

  // Write to circuits/input.json
  const outputPath = path.resolve(__dirname, "../circuits/input.json");
  fs.writeFileSync(outputPath, JSON.stringify(input, null, 2) + "\n");
  console.log(`\nValid input written to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
