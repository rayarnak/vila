use soroban_sdk::{contracttype, BytesN, U256};

/// Storage keys for the Vila Pool contract.
#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    Token,
    Verifier,
    Denomination,
    MerkleTreeDepth,
    MerkleTreeNextIndex,
    FilledSubtree(u32),
    Root(u32),
    CurrentRootIndex,
    NextIndex,
    Nullifier(U256),
    EncryptedNote(u32),
    SwapRouter,
}

/// Groth16 proof data passed to withdraw.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofData {
    /// pi_A: G1 point (64 bytes, BN254 uncompressed)
    pub a: BytesN<64>,
    /// pi_B: G2 point (128 bytes, BN254 uncompressed)
    pub b: BytesN<128>,
    /// pi_C: G1 point (64 bytes, BN254 uncompressed)
    pub c: BytesN<64>,
}

/// Root history ring buffer size.
pub const ROOT_HISTORY_SIZE: u32 = 100;

/// Merkle tree depth.
pub const TREE_DEPTH: u32 = 20;

/// Maximum capacity: 2^20 = 1,048,576 deposits.
pub const TREE_CAPACITY: u32 = 1 << TREE_DEPTH;
