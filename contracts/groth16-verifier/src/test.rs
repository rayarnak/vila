#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Groth16Verifier, ());
    let client = Groth16VerifierClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Create a minimal VK with zero points (for init test only)
    let alpha = BytesN::from_array(&env, &[0u8; 64]);
    let beta = BytesN::from_array(&env, &[0u8; 128]);
    let gamma = BytesN::from_array(&env, &[0u8; 128]);
    let delta = BytesN::from_array(&env, &[0u8; 128]);

    let mut ic = Vec::new(&env);
    ic.push_back(BytesN::from_array(&env, &[0u8; 64]));
    ic.push_back(BytesN::from_array(&env, &[0u8; 64]));

    let vk = VerificationKey {
        alpha,
        beta,
        gamma,
        delta,
        ic,
    };

    client.initialize(&admin, &vk);
    assert_eq!(client.num_public_inputs(), 1);
}

#[test]
fn test_num_public_inputs() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Groth16Verifier, ());
    let client = Groth16VerifierClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    let alpha = BytesN::from_array(&env, &[0u8; 64]);
    let beta = BytesN::from_array(&env, &[0u8; 128]);
    let gamma = BytesN::from_array(&env, &[0u8; 128]);
    let delta = BytesN::from_array(&env, &[0u8; 128]);

    let mut ic = Vec::new(&env);
    // 7 IC points = 6 public inputs
    for _ in 0..7 {
        ic.push_back(BytesN::from_array(&env, &[0u8; 64]));
    }

    let vk = VerificationKey {
        alpha,
        beta,
        gamma,
        delta,
        ic,
    };

    client.initialize(&admin, &vk);
    assert_eq!(client.num_public_inputs(), 6);
}
