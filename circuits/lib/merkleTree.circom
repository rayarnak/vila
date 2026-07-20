pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "dualMux.circom";

// Verifies a Merkle proof for a given leaf in a tree of specified depth.
// Uses Poseidon(2) as the hash function at each level.
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hashers[levels];
    component mux[levels];

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        mux[i] = DualMux();
        mux[i].in[0] <== hashes[i];
        mux[i].in[1] <== pathElements[i];
        mux[i].sel <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        hashes[i + 1] <== hashers[i].out;
    }

    root === hashes[levels];
}
