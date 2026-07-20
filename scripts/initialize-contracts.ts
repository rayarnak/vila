/**
 * Initialize deployed contracts on testnet using stellar CLI.
 * Usage: npx tsx scripts/initialize-contracts.ts
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const VERIFIER_ID = "CA4QCLXLRSBLG4MPTQZXZSJTOOGPMWERGBHEICUKHUHUPWXQHB7LYBQB";
const POOL_ID = "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";
const TOKEN_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const DENOMINATION = 1_000_000_000; // 100 XLM in stroops

function run(cmd: string): string {
  console.log(`  $ ${cmd.slice(0, 120)}...`);
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 60_000 }).trim();
  } catch (err: any) {
    console.error("  ERROR:", err.stderr || err.message);
    throw err;
  }
}

function bigintToHex(value: bigint, bytes: number): string {
  return value.toString(16).padStart(bytes * 2, "0");
}

function pointToG1Hex(point: string[]): string {
  const x = BigInt(point[0]);
  const y = BigInt(point[1]);
  return bigintToHex(x, 32) + bigintToHex(y, 32);
}

function pointToG2Hex(point: string[][]): string {
  // snarkjs G2: [[x1, x0], [y1, y0]]
  // Soroban BN254 G2: x.c0, x.c1, y.c0, y.c1
  const x0 = BigInt(point[0][0]);
  const x1 = BigInt(point[0][1]);
  const y0 = BigInt(point[1][0]);
  const y1 = BigInt(point[1][1]);
  return bigintToHex(x1, 32) + bigintToHex(x0, 32) + bigintToHex(y1, 32) + bigintToHex(y0, 32);
}

async function main() {
  console.log("=== Vila Protocol — Contract Initialization ===\n");

  const deployerAddr = run("stellar keys address vila-deployer");
  console.log("Deployer:", deployerAddr, "\n");

  // Load verification key
  const vkPath = path.resolve(__dirname, "../circuits/build/verification_key.json");
  const vk = JSON.parse(fs.readFileSync(vkPath, "utf-8"));

  // Build VK as JSON for --arg
  const alphaHex = pointToG1Hex(vk.vk_alpha_1);
  const betaHex = pointToG2Hex(vk.vk_beta_2);
  const gammaHex = pointToG2Hex(vk.vk_gamma_2);
  const deltaHex = pointToG2Hex(vk.vk_delta_2);
  const icHexes = vk.IC.map((p: string[]) => pointToG1Hex(p));

  // Step 1: Initialize verifier
  console.log("[1/2] Initializing Groth16 Verifier...");
  const icVecStr = icHexes.map((h: string) => `"${h}"`).join(", ");

  // Use stellar contract invoke with JSON args
  // BytesN<N> fields are passed as plain hex strings in Stellar CLI JSON
  const vkJson = JSON.stringify({
    alpha: alphaHex,
    beta: betaHex,
    delta: deltaHex,
    gamma: gammaHex,
    ic: icHexes,
  });

  try {
    const result = run(
      `stellar contract invoke --id ${VERIFIER_ID} --source vila-deployer --network testnet -- initialize --admin ${deployerAddr} --vk '${vkJson}'`
    );
    console.log("  Verifier initialized!", result);
  } catch (err) {
    console.log("  Verifier init failed — may already be initialized");
  }

  // Step 2: Initialize pool
  console.log("\n[2/2] Initializing Vila Pool...");
  try {
    const result = run(
      `stellar contract invoke --id ${POOL_ID} --source vila-deployer --network testnet -- initialize --admin ${deployerAddr} --token ${TOKEN_ID} --verifier ${VERIFIER_ID} --denomination ${DENOMINATION}`
    );
    console.log("  Pool initialized!", result);
  } catch (err) {
    console.log("  Pool init failed — may already be initialized or budget issue");
  }

  // Write .env
  const deployerSecret = run("stellar keys show vila-deployer");
  console.log("\nWriting .env...");
  const envContent = `# Stellar Network
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Deployed Contract IDs
POOL_CONTRACT_ID=${POOL_ID}
VERIFIER_CONTRACT_ID=${VERIFIER_ID}
TOKEN_CONTRACT_ID=${TOKEN_ID}

# Deployer key
DEPLOYER_SECRET_KEY=${deployerSecret}

# Relayer
RELAYER_SECRET_KEY=${deployerSecret}
RELAYER_PORT=3001
RELAYER_FEE_BPS=50

# Frontend
NEXT_PUBLIC_POOL_CONTRACT_ID=${POOL_ID}
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_RELAYER_URL=http://localhost:3001

# ZK artifacts
CIRCUIT_WASM_PATH=circuits/build/withdraw_js/withdraw.wasm
CIRCUIT_ZKEY_PATH=circuits/build/withdraw_final.zkey
VERIFICATION_KEY_PATH=circuits/build/verification_key.json
`;
  fs.writeFileSync(path.resolve(__dirname, "../.env"), envContent);
  console.log(".env written\n");
  console.log("=== Done! ===");
}

main().catch(console.error);
