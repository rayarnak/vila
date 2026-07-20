/**
 * Server-side Poseidon Merkle tree (depth 10) for the Privacy Pools
 * approved-commitment subset.
 *
 * An Association Set Provider (ASP) screens deposits and adds approved
 * commitments to this tree. During withdrawal, the user generates a
 * subset proof showing their commitment exists in the approved set.
 *
 * Persistence: .subset-tree.json (same pattern as .commitments.json)
 */
import fs from "fs";
import path from "path";

const SUBSET_DEPTH = 10; // 2^10 = 1024 slots
const STORE_PATH = path.join(process.cwd(), ".subset-tree.json");

// ── Poseidon singleton (server-side) ──

let poseidonFn: ((inputs: bigint[]) => bigint) | null = null;

async function getPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonFn) return poseidonFn;
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  poseidonFn = (inputs: bigint[]) => {
    const hash = poseidon(inputs);
    return poseidon.F.toObject(hash);
  };
  return poseidonFn;
}

// ── Types ──

interface SubsetTreeState {
  commitments: string[]; // hex strings (64 chars, no 0x prefix)
}

export interface SubsetProofData {
  pathElements: string[];
  pathIndices: number[];
  root: string;
}

export interface SubsetTreeInfo {
  root: string;
  size: number;
  depth: number;
  commitments: string[];
}

// ── Persistence ──

function readStore(): SubsetTreeState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    }
  } catch {
    /* corrupted — start fresh */
  }
  return { commitments: [] };
}

function writeStore(state: SubsetTreeState) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

// ── Merkle tree construction ──

async function computeZeros(): Promise<bigint[]> {
  const poseidon = await getPoseidon();
  const zeros: bigint[] = [0n];
  for (let i = 1; i <= SUBSET_DEPTH; i++) {
    zeros[i] = poseidon([zeros[i - 1], zeros[i - 1]]);
  }
  return zeros;
}

/**
 * Build a full Merkle tree from the given leaves and return the layers.
 * layers[0] = leaves (padded to 2^depth with zero), layers[depth] = [root]
 */
async function buildLayers(leaves: bigint[]): Promise<bigint[][]> {
  const poseidon = await getPoseidon();
  const zeros = await computeZeros();
  const size = 1 << SUBSET_DEPTH;

  // Pad leaves
  const paddedLeaves: bigint[] = new Array(size);
  for (let i = 0; i < size; i++) {
    paddedLeaves[i] = i < leaves.length ? leaves[i] : zeros[0];
  }

  const layers: bigint[][] = [paddedLeaves];
  let currentLayer = paddedLeaves;

  for (let level = 0; level < SUBSET_DEPTH; level++) {
    const nextLayer: bigint[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      const left = currentLayer[i];
      const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : zeros[level];
      nextLayer.push(poseidon([left, right]));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  return layers;
}

function bigintToHex(val: bigint): string {
  return val.toString(16).padStart(64, "0");
}

// ── Public API ──

/**
 * Get current subset tree state.
 */
export async function getSubsetTreeInfo(): Promise<SubsetTreeInfo> {
  const store = readStore();
  const leaves = store.commitments.map((c) => BigInt("0x" + c));
  const layers = await buildLayers(leaves);
  const root = layers[SUBSET_DEPTH][0];

  return {
    root: bigintToHex(root),
    size: store.commitments.length,
    depth: SUBSET_DEPTH,
    commitments: store.commitments,
  };
}

/**
 * Add a commitment to the approved subset. Returns true if newly added.
 */
export function addToSubset(commitment: string): boolean {
  const normalized = commitment.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const store = readStore();

  if (store.commitments.includes(normalized)) {
    return false;
  }

  if (store.commitments.length >= 1 << SUBSET_DEPTH) {
    throw new Error(`Subset tree full (max ${1 << SUBSET_DEPTH} commitments)`);
  }

  store.commitments.push(normalized);
  writeStore(store);
  return true;
}

/**
 * Check if a commitment is in the approved subset.
 */
export function isInSubset(commitment: string): boolean {
  const normalized = commitment.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const store = readStore();
  return store.commitments.includes(normalized);
}

/**
 * Generate a Merkle proof for a commitment in the subset tree.
 * Returns null if the commitment is not in the subset.
 */
export async function getSubsetProof(commitment: string): Promise<SubsetProofData | null> {
  const normalized = commitment.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const store = readStore();
  const leafIndex = store.commitments.indexOf(normalized);

  if (leafIndex === -1) return null;

  const leaves = store.commitments.map((c) => BigInt("0x" + c));
  const layers = await buildLayers(leaves);

  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;

  for (let level = 0; level < SUBSET_DEPTH; level++) {
    const siblingIdx = idx ^ 1;
    const sibling = siblingIdx < layers[level].length ? layers[level][siblingIdx] : 0n;
    pathElements.push(bigintToHex(sibling));
    pathIndices.push(idx & 1);
    idx >>= 1;
  }

  return {
    pathElements,
    pathIndices,
    root: bigintToHex(layers[SUBSET_DEPTH][0]),
  };
}
