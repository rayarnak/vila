import { getPoseidon } from "./note";

/**
 * Client-side incremental Merkle tree (mirrors the on-chain tree).
 * Depth 20 — supports up to 2^20 = ~1M leaves.
 */
export class MerkleTree {
  readonly depth: number;
  readonly capacity: number;

  private _leaves: bigint[];
  private _layers: bigint[][];
  private _zeroValues: bigint[];
  private _poseidon: ((inputs: bigint[]) => bigint) | null = null;

  constructor(depth: number = 20, leaves: bigint[] = []) {
    this.depth = depth;
    this.capacity = 2 ** depth;
    this._leaves = [];
    this._layers = [];
    this._zeroValues = [];

    // Will be initialized async
    if (leaves.length > 0) {
      this._leaves = [...leaves];
    }
  }

  /**
   * Initialize the tree (must be called before use).
   * Computes zero values and builds layers from any initial leaves.
   */
  async init(): Promise<void> {
    const poseidonFn = await getPoseidon();
    this._poseidon = poseidonFn;

    // Compute zero values
    this._zeroValues = new Array(this.depth + 1);
    this._zeroValues[0] = 0n;
    for (let i = 1; i <= this.depth; i++) {
      this._zeroValues[i] = this._poseidon([
        this._zeroValues[i - 1],
        this._zeroValues[i - 1],
      ]);
    }

    // Build layers
    this._rebuild();
  }

  /**
   * Insert a new leaf. Returns the leaf index.
   */
  insert(leaf: bigint): number {
    if (this._leaves.length >= this.capacity) {
      throw new Error("Merkle tree is full");
    }
    const index = this._leaves.length;
    this._leaves.push(leaf);
    this._rebuild();
    return index;
  }

  /**
   * Get the Merkle proof (path) for a given leaf index.
   */
  getPath(leafIndex: number): {
    pathElements: bigint[];
    pathIndices: number[];
  } {
    if (leafIndex < 0 || leafIndex >= this._leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range`);
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let idx = leafIndex;
    for (let level = 0; level < this.depth; level++) {
      const siblingIdx = idx ^ 1; // XOR to get sibling
      const layer = this._layers[level];

      if (siblingIdx < layer.length) {
        pathElements.push(layer[siblingIdx]);
      } else {
        pathElements.push(this._zeroValues[level]);
      }

      pathIndices.push(idx % 2); // 0 = left, 1 = right
      idx = Math.floor(idx / 2);
    }

    return { pathElements, pathIndices };
  }

  /**
   * Get the current Merkle root.
   */
  get root(): bigint {
    if (this._layers.length === 0) {
      return this._zeroValues[this.depth];
    }
    const topLayer = this._layers[this._layers.length - 1];
    return topLayer.length > 0 ? topLayer[0] : this._zeroValues[this.depth];
  }

  /**
   * Get the number of inserted leaves.
   */
  get leafCount(): number {
    return this._leaves.length;
  }

  /**
   * Rebuild all layers from leaves.
   */
  private _rebuild(): void {
    if (!this._poseidon) {
      throw new Error("Tree not initialized — call init() first");
    }

    this._layers = [];
    this._layers.push([...this._leaves]);

    for (let level = 0; level < this.depth; level++) {
      const currentLayer = this._layers[level];
      const nextLayer: bigint[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right =
          i + 1 < currentLayer.length
            ? currentLayer[i + 1]
            : this._zeroValues[level];
        nextLayer.push(this._poseidon([left, right]));
      }

      // If the layer is empty, use the zero value for the next level
      if (nextLayer.length === 0) {
        nextLayer.push(this._zeroValues[level + 1]);
      }

      this._layers.push(nextLayer);
    }
  }
}
