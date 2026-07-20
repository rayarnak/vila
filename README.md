# Vila Protocol

**Private payments on Stellar using Zero-Knowledge proofs.**

Vila enables shielded stablecoin transfers on Stellar using Groth16 ZK proofs verified on Soroban. Deposit XLM into a shielded pool, share a secret note with your recipient, and they withdraw privately — with zero on-chain link between depositor and recipient.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Depositor   │────▶│  Vila Pool   │◀────│    Recipient       │
│  (Freighter) │     │  (Soroban)   │     │  (ZK Proof + QR)  │
└─────────────┘     └──────┬───────┘     └────────┬──────────┘
                           │                       │
                    ┌──────▼───────┐        ┌──────▼──────────┐
                    │ Merkle Tree  │        │  Groth16        │
                    │ (Poseidon)   │        │  Verifier       │
                    │ depth=20     │        │  (BN254 on      │
                    │ ~1M leaves   │        │   Soroban)      │
                    └──────────────┘        └─────────────────┘
                                                    ▲
┌─────────────┐     ┌──────────────┐                │
│  Relayer     │────▶│  Submit TX   │────────────────┘
│  (Express)   │     │  (random     │
│  :3001       │     │   delay)     │
└─────────────┘     └──────────────┘
```

### Flow

1. **Deposit**: User deposits a fixed amount of XLM. A Poseidon commitment `H(nullifier, secret)` is inserted into the on-chain Merkle tree.
2. **Share**: User receives a secret note (nullifier + secret). They share it with the recipient via QR code or private message.
3. **Prove**: Recipient generates a Groth16 ZK proof in-browser proving they know the preimage of a commitment in the tree — without revealing which one.
4. **Withdraw**: Proof is submitted via a relayer (with random delay for timing decorrelation). The Soroban contract verifies the proof using BN254 host functions and releases funds.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ZK Circuits | Circom 2.0 + snarkjs (Groth16 over BN254) |
| Hash Function | Poseidon (circomlib + `soroban-poseidon` crate for BN254 Fr) |
| Smart Contracts | Soroban (Rust), `wasm32v1-none` target |
| On-chain Verifier | Groth16 BN254 via `env.crypto().bn254().g1_add/g1_mul/pairing_check` |
| Frontend | Next.js 14 (App Router, Tailwind) |
| SDK | TypeScript + snarkjs WASM for client-side proving |
| Relayer | Express.js with random delay queue |

## Project Structure

```
private soroban/
├── circuits/                    # Circom ZK circuits
│   ├── withdraw.circom          # Main withdrawal circuit (depth 20)
│   └── lib/                     # Circuit libraries (Poseidon, Merkle, DualMux)
├── contracts/                   # Soroban smart contracts (Rust)
│   ├── groth16-verifier/        # BN254 Groth16 proof verifier
│   └── vila-pool/               # Shielded pool (deposit/withdraw/Merkle tree)
├── sdk/                         # TypeScript SDK
│   └── src/                     # Note mgmt, Merkle tree, proof gen, viewing keys
├── relayer/                     # Express relayer service
├── app/                         # Next.js 14 frontend
│   └── src/app/                 # Landing, deposit, withdraw, compliance pages
└── scripts/                     # Build, deploy, ceremony, demo scripts
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Rust + `wasm32v1-none` target
- [Circom 2.0](https://docs.circom.io/getting-started/installation/)
- [Stellar CLI](https://soroban.stellar.org/docs/getting-started/setup)

### Setup

```bash
# Install dependencies
npm install

# Compile ZK circuit
./scripts/compile-circuit.sh

# Run trusted setup ceremony
./scripts/setup-ceremony.sh

# Build Soroban contracts
cd contracts && stellar contract build && cd ..

# Deploy to testnet
./scripts/deploy.sh

# Run the demo
./scripts/demo.sh
```

### Development

```bash
# Frontend dev server
npm run dev

# Relayer
npm run relayer

# Generate test proof
npm run generate:proof
```

## Key Features

### Groth16 on Soroban
The verifier contract uses Soroban's native BN254 host functions for efficient on-chain proof verification — no custom elliptic curve arithmetic needed.

### Poseidon Hash Alignment
Both the Circom circuits and the Soroban Merkle tree use Poseidon over the BN254 Fr field, ensuring zero parameter mismatch between off-chain proof generation and on-chain verification.

### Relayer Network
Withdrawals are submitted through a relayer with random delay queuing (30s–5min), breaking the timing correlation between deposits and withdrawals.

### Timelocked Viewing Keys
Compliance-ready: generate viewing keys that can decrypt transaction metadata, but only after a configurable timelock period. This enables regulatory audit trails while preserving real-time privacy.

### Encrypted On-chain Memos
Attach encrypted notes to deposits using NaCl box encryption (x25519-xsalsa20-poly1305), recoverable only by the intended recipient.

### Off-ramp via CheesePay
Withdraw from the shielded pool and optionally cash out to local currency via [CheesePay](https://cheesepay.xyz). The withdrawal stays private — no public link between deposit and cash-out.

## Contracts

| Contract | Description |
|----------|------------|
| **Groth16 Verifier** | BN254 Groth16 proof verification using `bn254_g1_add`, `bn254_g1_mul`, `bn254_multi_pairing_check` |
| **Vila Pool** | Shielded pool with incremental Merkle tree (depth 20), nullifier tracking, 100-root ring buffer |

## Circuit

The withdrawal circuit (`circuits/withdraw.circom`) proves:

1. Knowledge of `(nullifier, secret)` such that `Poseidon(nullifier, secret)` is a leaf in the Merkle tree
2. The `nullifierHash = Poseidon(nullifier)` matches the claimed value (prevents double-spend)
3. The Merkle proof is valid for the given root
4. The `recipient`, `relayer`, `fee`, and `refund` values are bound to the proof (prevents frontrunning)

**Depth**: 20 levels (~1M deposit capacity)
**Hash**: Poseidon(2) over BN254 Fr
**Proof system**: Groth16 (constant-size proof, ~3-5s browser generation)

## Security

- **Double-spend prevention**: Nullifier hashes are stored on-chain; reuse is rejected
- **Frontrun prevention**: Recipient/relayer/fee bound to proof via dummy constraints
- **Root staleness**: Contract stores last 100 roots; proofs against stale roots are rejected
- **Timing decorrelation**: Relayer adds random delays between receiving and submitting withdrawals

## License

MIT

---

*Built for the Stellar ZK Hack (June 15–29, 2026)*
