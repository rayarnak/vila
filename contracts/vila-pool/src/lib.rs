#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Bytes, BytesN, Env,
    IntoVal, Symbol, U256, Val, Vec,
};

mod merkle;
mod types;

use types::{DataKey, ProofData};

// TTL constants: ~1 day threshold, ~31 day bump (ledger ≈ 5s)
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_BUMP: u32 = 535_680;
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_BUMP: u32 = 535_680;

#[contractevent]
#[derive(Clone, Debug)]
pub struct DepositEvent {
    pub from: Address,
    pub commitment: U256,
    pub leaf_index: u32,
}

#[contractevent]
#[derive(Clone, Debug)]
pub struct WithdrawalEvent {
    pub recipient: Address,
    pub nullifier_hash: U256,
    pub relayer: Address,
    pub fee: i128,
}

#[contract]
pub struct VilaPool;

#[contractimpl]
impl VilaPool {
    /// Initialize the Vila Pool.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        verifier: Address,
        denomination: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        assert!(denomination > 0, "denomination must be positive");

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage()
            .instance()
            .set(&DataKey::Denomination, &denomination);

        merkle::init_tree(&env);

        // Extend TTLs so contract survives testnet archival
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        bump_tree_ttl(&env);
    }

    /// Deposit tokens into the pool. Returns the leaf index.
    pub fn deposit(env: Env, from: Address, commitment: U256) -> u32 {
        from.require_auth();

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let denomination: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Denomination)
            .unwrap();

        let pool_address = env.current_contract_address();
        token::Client::new(&env, &token_addr).transfer(&from, &pool_address, &denomination);

        let leaf_index = merkle::insert(&env, &commitment);

        // Extend TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        bump_tree_ttl(&env);

        env.events().publish_event(&DepositEvent {
            from,
            commitment,
            leaf_index,
        });

        leaf_index
    }

    /// Deposit with an encrypted note stored on-chain.
    pub fn deposit_with_note(
        env: Env,
        from: Address,
        commitment: U256,
        encrypted_note: Bytes,
    ) -> u32 {
        let leaf_index = Self::deposit(env.clone(), from, commitment);

        env.storage()
            .persistent()
            .set(&DataKey::EncryptedNote(leaf_index), &encrypted_note);
        env.storage().persistent().extend_ttl(
            &DataKey::EncryptedNote(leaf_index),
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_BUMP,
        );

        leaf_index
    }

    /// Withdraw tokens from the pool using a ZK proof.
    pub fn withdraw(
        env: Env,
        proof: ProofData,
        root: U256,
        nullifier_hash: U256,
        recipient: Address,
        relayer: Address,
        fee: i128,
        refund: i128,
    ) {
        let denomination: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Denomination)
            .unwrap();

        assert!(fee <= denomination, "fee exceeds denomination");
        assert!(refund == 0, "refund not supported yet");

        assert!(
            merkle::is_known_root(&env, &root),
            "unknown merkle root"
        );

        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Nullifier(nullifier_hash.clone())),
            "nullifier already spent"
        );

        // Build public inputs for verification
        let recipient_field = address_to_field_bytes(&env, &recipient);
        let relayer_field = address_to_field_bytes(&env, &relayer);
        let fee_field = i128_to_bytes32(&env, fee);
        let refund_field = i128_to_bytes32(&env, refund);

        let mut public_inputs: Vec<BytesN<32>> = Vec::new(&env);
        let root_bytes = root.to_be_bytes();
        let mut root_arr = [0u8; 32];
        root_bytes.copy_into_slice(&mut root_arr);
        public_inputs.push_back(BytesN::from_array(&env, &root_arr));

        let nh_bytes = nullifier_hash.to_be_bytes();
        let mut nh_arr = [0u8; 32];
        nh_bytes.copy_into_slice(&mut nh_arr);
        public_inputs.push_back(BytesN::from_array(&env, &nh_arr));

        public_inputs.push_back(recipient_field);
        public_inputs.push_back(relayer_field);
        public_inputs.push_back(fee_field);
        public_inputs.push_back(refund_field);

        // Call the verifier contract
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();

        let verifier_proof = VerifierProofData {
            a: proof.a,
            b: proof.b,
            c: proof.c,
        };

        // Cross-contract call: verifier.verify(proof, public_inputs)
        let args: Vec<Val> = soroban_sdk::vec![
            &env,
            verifier_proof.into_val(&env),
            public_inputs.into_val(&env)
        ];

        let verified: bool = env.invoke_contract(&verifier, &Symbol::new(&env, "verify"), args);

        assert!(verified, "invalid withdrawal proof");

        // Mark nullifier as spent
        env.storage()
            .persistent()
            .set(&DataKey::Nullifier(nullifier_hash.clone()), &true);
        env.storage().persistent().extend_ttl(
            &DataKey::Nullifier(nullifier_hash.clone()),
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_BUMP,
        );

        // Extend instance + tree TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        bump_tree_ttl(&env);

        // Transfer tokens
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let pool_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token_addr);

        if fee > 0 {
            token_client.transfer(&pool_address, &relayer, &fee);
            let payout = denomination - fee;
            token_client.transfer(&pool_address, &recipient, &payout);
        } else {
            token_client.transfer(&pool_address, &recipient, &denomination);
        }

        env.events().publish_event(&WithdrawalEvent {
            recipient,
            nullifier_hash,
            relayer,
            fee,
        });
    }

    /// Set the swap router contract address. Admin-only.
    pub fn set_swap_router(env: Env, router: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::SwapRouter, &router);
    }

    /// Withdraw tokens from the pool and swap to a different token via the router.
    ///
    /// The ZK proof binds `recipient` as an anti-frontrun constraint. `token_out`
    /// and `min_amount_out` are user preferences — not security-critical — because
    /// funds can only go to the proof-bound recipient regardless of swap params.
    pub fn withdraw_swap(
        env: Env,
        proof: ProofData,
        root: U256,
        nullifier_hash: U256,
        recipient: Address,
        relayer: Address,
        fee: i128,
        refund: i128,
        token_out: Address,
        min_amount_out: i128,
    ) {
        let denomination: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Denomination)
            .unwrap();

        assert!(fee <= denomination, "fee exceeds denomination");
        assert!(refund == 0, "refund not supported yet");

        assert!(
            merkle::is_known_root(&env, &root),
            "unknown merkle root"
        );

        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Nullifier(nullifier_hash.clone())),
            "nullifier already spent"
        );

        // Build public inputs — identical to withdraw()
        let recipient_field = address_to_field_bytes(&env, &recipient);
        let relayer_field = address_to_field_bytes(&env, &relayer);
        let fee_field = i128_to_bytes32(&env, fee);
        let refund_field = i128_to_bytes32(&env, refund);

        let mut public_inputs: Vec<BytesN<32>> = Vec::new(&env);
        let root_bytes = root.to_be_bytes();
        let mut root_arr = [0u8; 32];
        root_bytes.copy_into_slice(&mut root_arr);
        public_inputs.push_back(BytesN::from_array(&env, &root_arr));

        let nh_bytes = nullifier_hash.to_be_bytes();
        let mut nh_arr = [0u8; 32];
        nh_bytes.copy_into_slice(&mut nh_arr);
        public_inputs.push_back(BytesN::from_array(&env, &nh_arr));

        public_inputs.push_back(recipient_field);
        public_inputs.push_back(relayer_field);
        public_inputs.push_back(fee_field);
        public_inputs.push_back(refund_field);

        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let verifier_proof = VerifierProofData {
            a: proof.a,
            b: proof.b,
            c: proof.c,
        };

        let args: Vec<Val> = soroban_sdk::vec![
            &env,
            verifier_proof.into_val(&env),
            public_inputs.into_val(&env)
        ];

        let verified: bool = env.invoke_contract(&verifier, &Symbol::new(&env, "verify"), args);
        assert!(verified, "invalid withdrawal proof");

        // Mark nullifier as spent
        env.storage()
            .persistent()
            .set(&DataKey::Nullifier(nullifier_hash.clone()), &true);
        env.storage().persistent().extend_ttl(
            &DataKey::Nullifier(nullifier_hash.clone()),
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_BUMP,
        );

        // Extend instance + tree TTLs
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        bump_tree_ttl(&env);

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let pool_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token_addr);

        // Pay relayer fee
        if fee > 0 {
            token_client.transfer(&pool_address, &relayer, &fee);
        }

        // Transfer remaining amount to the swap router, then cross-contract swap
        let swap_amount = denomination - fee;
        let router: Address = env
            .storage()
            .instance()
            .get(&DataKey::SwapRouter)
            .expect("swap router not set");

        token_client.transfer(&pool_address, &router, &swap_amount);

        let swap_args: Vec<Val> = soroban_sdk::vec![
            &env,
            token_addr.into_val(&env),
            token_out.into_val(&env),
            swap_amount.into_val(&env),
            min_amount_out.into_val(&env),
            recipient.clone().into_val(&env)
        ];

        let _amount_out: i128 =
            env.invoke_contract(&router, &Symbol::new(&env, "swap"), swap_args);

        env.events().publish_event(&WithdrawalEvent {
            recipient,
            nullifier_hash,
            relayer,
            fee,
        });
    }

    /// Check if a Merkle root is known.
    pub fn is_known_root(env: Env, root: U256) -> bool {
        merkle::is_known_root(&env, &root)
    }

    /// Get the latest Merkle root.
    pub fn get_last_root(env: Env) -> U256 {
        merkle::get_last_root(&env)
    }

    /// Get the next leaf index (total deposits).
    pub fn get_next_index(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::NextIndex)
            .unwrap_or(0)
    }

    /// Check if a nullifier has been spent.
    pub fn is_spent(env: Env, nullifier_hash: U256) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier_hash))
    }

    /// Get an encrypted note by leaf index.
    pub fn get_encrypted_note(env: Env, leaf_index: u32) -> Bytes {
        env.storage()
            .persistent()
            .get(&DataKey::EncryptedNote(leaf_index))
            .unwrap()
    }

    /// Get the fixed denomination amount.
    pub fn get_denomination(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Denomination)
            .unwrap()
    }
}

/// Mirror of the verifier's Groth16Proof type for cross-contract calls.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VerifierProofData {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// Convert a Stellar address to a deterministic 32-byte field element.
///
/// Serializes the address to its Soroban object representation, then hashes
/// with keccak256 to produce a unique, deterministic binding. This is critical
/// for anti-frontrun security — the proof is cryptographically bound to the
/// exact recipient/relayer addresses.
fn address_to_field_bytes(env: &Env, addr: &Address) -> BytesN<32> {
    // Convert address to its canonical string form (G... for accounts, C... for contracts)
    let addr_str = addr.to_string();

    // Copy string bytes into a fixed buffer for hashing
    let mut raw = [0u8; 56]; // Stellar addresses are 56 chars
    let str_len = addr_str.len();
    let copy_len = if str_len < 56 { str_len } else { 56 };
    addr_str.copy_into_slice(&mut raw[..copy_len as usize]);
    let addr_bytes = Bytes::from_slice(env, &raw[..copy_len as usize]);

    // sha256 produces a deterministic 32-byte digest
    let hash = env.crypto().sha256(&addr_bytes);
    let mut buf = hash.to_array();
    // Zero the top byte to ensure the value fits within the BLS12-381/BN254 scalar field
    buf[0] = 0;
    BytesN::from_array(env, &buf)
}

/// Convert i128 to 32-byte big-endian BytesN.
fn i128_to_bytes32(env: &Env, val: i128) -> BytesN<32> {
    assert!(val >= 0, "negative value");
    let mut buf = [0u8; 32];
    let bytes = (val as u128).to_be_bytes();
    buf[16..32].copy_from_slice(&bytes);
    BytesN::from_array(env, &buf)
}

/// Extend TTL on the core Merkle tree persistent entries touched by the current
/// operation.
///
/// NOTE: this deliberately does NOT walk the full `ROOT_HISTORY_SIZE` root ring
/// buffer. Every key referenced in an invocation — whether it exists or not — is
/// charged against the transaction's ledger-entry footprint, and Soroban caps a
/// single invocation at ~100 entries. Scanning all 100 root slots pushed the
/// `initialize` footprint to 151 entries, which fails both in the test host and
/// on-chain. Each root is bumped while it is the current root (in `initialize`
/// and every `insert`), so it already receives a full TTL window before the ring
/// rotates past it.
fn bump_tree_ttl(env: &Env) {
    use types::TREE_DEPTH;

    // NextIndex + CurrentRootIndex
    for key in [DataKey::NextIndex, DataKey::CurrentRootIndex] {
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
        }
    }
    // FilledSubtree entries (fixed count = TREE_DEPTH)
    for i in 0..TREE_DEPTH {
        let key = DataKey::FilledSubtree(i);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
        }
    }
    // Only the current root — bumping the whole ring would blow the footprint.
    let current_root_index: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::CurrentRootIndex)
        .unwrap_or(0);
    let root_key = DataKey::Root(current_root_index);
    if env.storage().persistent().has(&root_key) {
        env.storage()
            .persistent()
            .extend_ttl(&root_key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
    }
}

#[cfg(test)]
mod test;
