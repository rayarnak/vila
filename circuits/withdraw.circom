pragma circom 2.0.0;

include "lib/commitment.circom";
include "lib/merkleTree.circom";

// Main withdrawal circuit for Vila Protocol.
//
// Proves:
// 1. Knowledge of (nullifier, secret) that hash to a commitment in the Merkle tree
// 2. The nullifier hash matches the claimed nullifierHash
// 3. The commitment is included in the tree with the given root
// 4. Binds recipient/relayer/fee/refund to the proof (anti-frontrunning)
//
// Tree depth: 20 levels → supports ~1M deposits
template Withdraw(levels) {
    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input recipient;       // address field element
    signal input relayer;         // relayer address field element
    signal input fee;             // relayer fee amount
    signal input refund;          // refund amount to recipient on L1

    // Private inputs
    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Step 1: Compute commitment and nullifier hash
    component hasher = CommitmentHasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;

    // Step 2: Verify nullifier hash matches
    hasher.nullifierHash === nullifierHash;

    // Step 3: Verify Merkle tree inclusion
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // Step 4: Anti-frontrunning constraints
    // Square these values to create constraints that bind them to the proof
    // without revealing them. This prevents tx relay frontrunning.
    signal recipientSq;
    signal relayerSq;
    signal feeSq;
    signal refundSq;
    recipientSq <== recipient * recipient;
    relayerSq <== relayer * relayer;
    feeSq <== fee * fee;
    refundSq <== refund * refund;
}

component main {public [root, nullifierHash, recipient, relayer, fee, refund]} = Withdraw(20);
