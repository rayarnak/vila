#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine as G1Affine, Bn254G2Affine as G2Affine},
    Address, BytesN, Env, Vec,
};

// Build-time verification key data
include!(concat!(env!("OUT_DIR"), "/vk_data.rs"));

/// Verification key points for Groth16 over BN254.
///
/// Implements Groth16 verification over BN254 using Soroban's native host functions.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VerificationKey {
    /// alpha — G1 point (64 bytes uncompressed)
    pub alpha: BytesN<64>,
    /// beta — G2 point (128 bytes uncompressed)
    pub beta: BytesN<128>,
    /// gamma — G2 point (128 bytes uncompressed)
    pub gamma: BytesN<128>,
    /// delta — G2 point (128 bytes uncompressed)
    pub delta: BytesN<128>,
    /// IC (input commitments) — Vec of G1 points
    pub ic: Vec<BytesN<64>>,
}

/// Groth16 proof: three curve points.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Groth16Proof {
    /// pi_a — G1 point (64 bytes)
    pub a: BytesN<64>,
    /// pi_b — G2 point (128 bytes)
    pub b: BytesN<128>,
    /// pi_c — G1 point (64 bytes)
    pub c: BytesN<64>,
}

// TTL constants: ~1 day threshold, ~31 day bump
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_BUMP: u32 = 535_680;

#[contracttype]
pub enum DataKey {
    Vk,
    Admin,
}

#[contract]
pub struct Groth16Verifier;

#[contractimpl]
impl Groth16Verifier {
    /// Initialize the verifier with the verification key.
    pub fn initialize(env: Env, admin: Address, vk: VerificationKey) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vk, &vk);
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
    }

    /// Verify a Groth16 proof against public inputs.
    ///
    /// Verification equation (as pairing check):
    ///   e(-pi_A, pi_B) * e(alpha, beta) * e(vk_x, gamma) * e(pi_C, delta) == 1
    ///
    /// Where vk_x = IC[0] + sum(public_input[i] * IC[i+1])
    pub fn verify(env: Env, proof: Groth16Proof, public_inputs: Vec<BytesN<32>>) -> bool {
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_BUMP);
        let vk: VerificationKey = env.storage().instance().get(&DataKey::Vk).unwrap();
        let bn254 = env.crypto().bn254();

        let ic_len = vk.ic.len();
        let n_public = public_inputs.len();

        if ic_len != n_public + 1 {
            return false;
        }

        // Compute vk_x = IC[0] + sum(public_input[i] * IC[i+1])
        let mut vk_x = G1Affine::from_bytes(vk.ic.get(0).unwrap());

        for i in 0..n_public {
            let scalar = Bn254Fr::from_bytes(public_inputs.get(i).unwrap());
            let ic_point = G1Affine::from_bytes(vk.ic.get(i + 1).unwrap());

            let mul_result = bn254.g1_mul(&ic_point, &scalar);
            vk_x = bn254.g1_add(&vk_x, &mul_result);
        }

        // Negate pi_A for the pairing check
        let neg_a = negate_g1(&env, &G1Affine::from_bytes(proof.a));
        let pi_b = G2Affine::from_bytes(proof.b);
        let alpha = G1Affine::from_bytes(vk.alpha);
        let beta = G2Affine::from_bytes(vk.beta);
        let gamma = G2Affine::from_bytes(vk.gamma);
        let delta = G2Affine::from_bytes(vk.delta);
        let pi_c = G1Affine::from_bytes(proof.c);

        // Multi-pairing check: product of pairings == 1
        let mut g1_points = Vec::new(&env);
        let mut g2_points = Vec::new(&env);

        g1_points.push_back(neg_a);     // -pi_A
        g2_points.push_back(pi_b);      // pi_B

        g1_points.push_back(alpha);     // alpha
        g2_points.push_back(beta);      // beta

        g1_points.push_back(vk_x);     // vk_x
        g2_points.push_back(gamma);     // gamma

        g1_points.push_back(pi_c);     // pi_C
        g2_points.push_back(delta);     // delta

        bn254.pairing_check(g1_points, g2_points)
    }

    /// Get the number of public inputs expected.
    pub fn num_public_inputs(env: Env) -> u32 {
        let vk: VerificationKey = env.storage().instance().get(&DataKey::Vk).unwrap();
        vk.ic.len() - 1
    }
}

/// Negate a G1 point (negate the y-coordinate).
/// BN254 base field prime p
fn negate_g1(env: &Env, point: &G1Affine) -> G1Affine {
    // Use scalar multiplication by -1 (r-1 in Fr)
    // Fr order: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
    let neg_one_bytes: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
        0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x00,
    ];
    let neg_one = Bn254Fr::from_bytes(BytesN::from_array(env, &neg_one_bytes));
    env.crypto().bn254().g1_mul(point, &neg_one)
}

#[cfg(test)]
mod test;
