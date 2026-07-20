/**
 * Generate a test Groth16 proof from sample inputs.
 * Usage: npx tsx scripts/generate-test-proof.ts
 */

import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("=== Vila Protocol — Test Proof Generation ===\n");

  const buildDir = path.resolve(__dirname, "../circuits/build");
  const wasmPath = path.join(buildDir, "withdraw_js/withdraw.wasm");
  const zkeyPath = path.join(buildDir, "withdraw_final.zkey");
  const inputPath = path.resolve(__dirname, "../circuits/input.json");

  // Check files exist
  for (const [name, p] of [
    ["WASM", wasmPath],
    ["zkey", zkeyPath],
    ["input", inputPath],
  ] as const) {
    if (!fs.existsSync(p)) {
      console.error(`Error: ${name} not found at ${p}`);
      console.error("Run ./scripts/compile-circuit.sh and ./scripts/setup-ceremony.sh first.");
      process.exit(1);
    }
  }

  console.log("[1/3] Loading circuit input...");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  console.log(`  Public inputs: root, nullifierHash, recipient, relayer, fee, refund`);
  console.log(`  Private inputs: nullifier, secret, pathElements[20], pathIndices[20]`);

  console.log("\n[2/3] Generating Groth16 proof...");
  const snarkjs = await import("snarkjs");
  const startTime = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );
  const elapsed = Date.now() - startTime;
  console.log(`  Proof generated in ${elapsed}ms`);

  console.log("\n[3/3] Verifying proof locally...");
  const vkeyPath = path.join(buildDir, "verification_key.json");
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`  Verification: ${valid ? "VALID" : "INVALID"}`);

  // Output proof
  console.log("\n=== Proof Output ===");
  console.log("Public signals:", publicSignals);
  console.log("\nProof (for on-chain verification):");
  console.log(JSON.stringify(proof, null, 2));

  // Save proof
  const outputPath = path.join(buildDir, "test_proof.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ proof, publicSignals }, null, 2)
  );
  console.log(`\nProof saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
