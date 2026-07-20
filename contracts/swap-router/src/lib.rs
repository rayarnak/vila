#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

// TTL constants: ~1 day threshold, ~31 day bump
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_BUMP: u32 = 535_680;
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_BUMP: u32 = 535_680;

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    Admin,
    /// Exchange rate in basis points (10000 = 1:1) for a token pair.
    Rate(Address, Address),
}

#[contract]
pub struct SwapRouter;

#[contractimpl]
impl SwapRouter {
    /// Initialize the swap router with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    /// Set the exchange rate for a token pair.
    /// `rate_bps` is in basis points: 10000 = 1:1, 1200 = 0.12:1.
    pub fn set_rate(env: Env, token_in: Address, token_out: Address, rate_bps: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(rate_bps > 0, "rate must be positive");
        let key = DataKey::Rate(token_in, token_out);
        env.storage().persistent().set(&key, &rate_bps);
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    /// Calculate the output amount for a given input.
    pub fn get_amount_out(env: Env, token_in: Address, token_out: Address, amount_in: i128) -> i128 {
        let key = DataKey::Rate(token_in, token_out);
        let rate_bps: i128 = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no rate set for this pair");
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        amount_in * rate_bps / 10000
    }

    /// Execute a swap: transfer `token_out` from router reserves to `recipient`.
    ///
    /// The caller must have already transferred `amount_in` of `token_in` to
    /// this contract before calling swap (the pool contract does this).
    pub fn swap(
        env: Env,
        token_in: Address,
        token_out: Address,
        amount_in: i128,
        min_amount_out: i128,
        recipient: Address,
    ) -> i128 {
        let rate_key = DataKey::Rate(token_in, token_out.clone());
        let rate_bps: i128 = env
            .storage()
            .persistent()
            .get(&rate_key)
            .expect("no rate set for this pair");
        env.storage().persistent().extend_ttl(&rate_key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);

        let amount_out = amount_in * rate_bps / 10000;
        assert!(
            amount_out >= min_amount_out,
            "slippage: output below minimum"
        );

        // Transfer output token from router reserves to recipient
        let router_address = env.current_contract_address();
        token::Client::new(&env, &token_out).transfer(&router_address, &recipient, &amount_out);

        amount_out
    }
}
