#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env
}

#[test]
fn test_initialize() {
    let env = setup_env();

    let contract_id = env.register(VilaPool, ());
    let client = VilaPoolClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let verifier = Address::generate(&env);
    let denomination: i128 = 10_000_000_000; // 1000 XLM in stroops

    client.initialize(&admin, &token, &verifier, &denomination);

    assert_eq!(client.get_denomination(), denomination);
    assert_eq!(client.get_next_index(), 0);
}

#[test]
fn test_merkle_tree_init() {
    let env = setup_env();

    let contract_id = env.register(VilaPool, ());
    let client = VilaPoolClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let verifier = Address::generate(&env);

    client.initialize(&admin, &token, &verifier, &1_000_000_000i128);

    // After init, should have a root and next_index = 0
    let root = client.get_last_root();
    assert!(client.is_known_root(&root));
    assert_eq!(client.get_next_index(), 0);
}

#[test]
fn test_nullifier_not_spent() {
    let env = setup_env();

    let contract_id = env.register(VilaPool, ());
    let client = VilaPoolClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    let verifier = Address::generate(&env);

    client.initialize(&admin, &token, &verifier, &1_000_000_000i128);

    let nullifier = U256::from_u32(&env, 12345);
    assert!(!client.is_spent(&nullifier));
}
