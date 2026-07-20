pragma circom 2.0.0;

include "lib/merkleTree.circom";

// Subset membership proof for Privacy Pools.
//
// Proves that a commitment (leaf) exists in a curated subset tree
// maintained by an Association Set Provider (ASP). This is verified
// at the application/relayer layer — the on-chain withdrawal proof
// remains unchanged.
//
// Based on Vitalik Buterin's "Privacy Pools" (2023).
//
// Tree depth: 10 levels → supports up to 1024 approved commitments
template SubsetProof(levels) {
    // Public inputs
    signal input root;   // subset tree root (from ASP)
    signal input leaf;   // the commitment being proven

    // Private inputs
    signal input pathElements[levels];  // Merkle proof siblings
    signal input pathIndices[levels];   // left/right flags (0 or 1)

    // Verify leaf exists in subset tree
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== leaf;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
}

component main {public [root, leaf]} = SubsetProof(10);
