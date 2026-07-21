# Vila Protocol

**Private payments on Stellar using Zero-Knowledge proofs.**

Vila enables shielded stablecoin transfers on Stellar using Groth16 ZK proofs verified on Soroban. Deposit XLM into a shielded pool, share a secret note with your recipient, and they withdraw privately — with zero on-chain link between depositor and recipient.

## Integration Evidence (Wallet · Contracts · CI/CD)

> Quick-reference map for reviewers. Every requirement below is implemented in tracked source files (paths given); code excerpts below are condensed from those files (imports/error-handling trimmed for readability).

### 1. Stellar Wallet Integration — Freighter ✅

- **Wallet library:** [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) `^4.1.0` — declared in **`app/package.json`** (alongside `@stellar/stellar-sdk`).
- **Connect Wallet button + flow:** **`app/src/components/ConnectWallet.tsx`** renders the `Connect Wallet` button (install-Freighter / disconnected / connected states) and is mounted in the app header (`app/src/components/AppShell.tsx`).
- **Wallet permissions, address retrieval & transaction signing:** **`app/src/lib/freighter.ts`** wraps every required method — `setAllowed`, `requestAccess`, `getAddress`, `signTransaction`, `isConnected`, `getNetwork`.

```ts
// app/src/lib/freighter.ts
import { setAllowed, requestAccess, getAddress, signTransaction } from "@stellar/freighter-api";

// Connect: grant permission (setAllowed) then request the account (requestAccess).
export async function connectFreighter(): Promise<string> {
  const allowed = await setAllowed();                 // wallet permission
  const access  = await requestAccess();              // address retrieval (prompts user)
  return access.address;
}

// Sign a Soroban/Stellar transaction envelope (XDR) with Freighter.
export async function signWithFreighter(xdr: string, networkPassphrase: string, address?: string) {
  const res = await signTransaction(xdr, { networkPassphrase, address });
  return res.signedTxXdr;                              // transaction signing
}
```

```tsx
// app/src/components/ConnectWallet.tsx  →  the Connect Wallet button
<button onClick={handleConnect}>
  <Wallet /> {connecting ? "Connecting…" : "Connect Wallet"}
</button>
```

### 2. Smart-Contract Integration — `@stellar/stellar-sdk` ✅

**`app/src/lib/soroban.ts`** is the canonical integration module. It builds contract invocations with `@stellar/stellar-sdk` and calls the **deployed** contract IDs (see [Deployment](#deployment)) over Soroban RPC:

```ts
// app/src/lib/soroban.ts
import * as StellarSdk from "@stellar/stellar-sdk";

export async function readContract(contractId, method, args = []) {
  const server   = new StellarSdk.rpc.Server(RPC_URL);
  const contract = new StellarSdk.Contract(contractId);           // deployed Soroban contract
  const tx = new StellarSdk.TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(method, ...args))                 // invoke a contract pub fn
    .setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  return StellarSdk.scValToNative(sim.result.retval);
}
```

### 3. Frontend ↔ Contract Function Mapping ✅

Each frontend call maps 1:1 to a `pub fn` in the contract `lib.rs` sources:

| Contract (`lib.rs`) | Contract `pub fn` | Frontend function | File |
|---|---|---|---|
| `vila-pool` | `deposit` | `executeDeposit()` | `app/src/lib/deposit.ts` |
| `vila-pool` | `withdraw` | `executeWithdraw()` | `app/src/lib/withdraw.ts` |
| `vila-pool` | `get_next_index` | `poolGetNextIndex()` | `app/src/lib/soroban.ts` |
| `vila-pool` | `get_last_root` | `poolGetLastRoot()` | `app/src/lib/soroban.ts` |
| `vila-pool` | `get_denomination` | `poolGetDenomination()` | `app/src/lib/soroban.ts` |
| `vila-pool` | `is_spent` | `poolIsSpent()` | `app/src/lib/soroban.ts` |
| `vila-pool` | `is_known_root` | `poolIsKnownRoot()` | `app/src/lib/soroban.ts` |
| `groth16-verifier` | `num_public_inputs` | `verifierNumPublicInputs()` | `app/src/lib/soroban.ts` |
| `swap-router` | `get_amount_out` | `swapGetAmountOut()` | `app/src/lib/soroban.ts` |

### 4. CI/CD Workflows ✅

- **`.github/workflows/ci.yml`** — **CI**: builds + tests the Soroban contracts (`cargo test`, `cargo build --target wasm32v1-none --release`) **and** lints + production-builds the Next.js frontend.
- **`.github/workflows/deploy.yml`** — **CD**: deploys the frontend to Vercel on every push to `main`, and deploys the Soroban contracts to Stellar testnet (`scripts/deploy.sh`) on manual dispatch.

## Deployment

**Live app:** https://app-silk-alpha.vercel.app
**Network:** Stellar Testnet (`Test SDF Network ; September 2015`)
**RPC:** `https://soroban-testnet.stellar.org`
**Deployer:** [`GC3YJTUFGFEMGXR2Q6I5XMKJ5NHPHN5SU643ABEGOEVMS4W6NBFGVW6A`](https://stellar.expert/explorer/testnet/account/GC3YJTUFGFEMGXR2Q6I5XMKJ5NHPHN5SU643ABEGOEVMS4W6NBFGVW6A)

### Core Contracts (deployed & verified on-chain)

| Contract | Contract ID | Explorer |
|----------|-------------|----------|
| **Groth16 Verifier** (BN254) | `CDKNHFXE5SSLFS4HKRWTQDORV7CCDBJGBKZ42M56OS555KTSXBAYCIBM` | [view](https://stellar.expert/explorer/testnet/contract/CDKNHFXE5SSLFS4HKRWTQDORV7CCDBJGBKZ42M56OS555KTSXBAYCIBM) |
| **Vila Pool** (default, 100 XLM) | `CB5C4ULIVLFL3B3FBX5EPEZAAE5G7NPU3TDMEKPSEVUFTIHBONN6COA6` | [view](https://stellar.expert/explorer/testnet/contract/CB5C4ULIVLFL3B3FBX5EPEZAAE5G7NPU3TDMEKPSEVUFTIHBONN6COA6) |
| **XLM Token** (SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | [view](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |
| **USDC Token** (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | [view](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

### Shielded Pool Tiers

Each denomination is an independent pool (fixed-amount deposits maximize the anonymity set).

| Tier | XLM Pool | USDC Pool |
|------|----------|-----------|
| 1     | `CBGJ2XWDCLDFOXDMNOW6F6UEYGX6FJKZIN5XWFYWCB67YUCFHVESTA47` | `CASQLEERSUFPWRNAQLPNNA7LWZTVED5KV5VCF5PKIAHGAQVAJ2XZORQB` |
| 5     | `CBKXVTFTFABAI3KCHK3GE6TDB6FJYW5KPQJVBEQIM27QLUKAWFVMAB5G` | `CAVSHJP26NTVDVTKTPGCEY2HMKVTJZNOG53AEKWAMMPV322EOU6R3VQF` |
| 10    | `CCXHA4364ET5PJQZHXXNWQXUFUOUP5MBJBYDJJ7TFC6ONKE43UEIHZ7S` | `CCOB23WLOLH4OHJGRXM5VISAPJI2HSNI5PU22LLKHQJIEU4IUTGYKRJW` |
| 50    | `CBRTIQ5LJQVOVAM7OVI2MYCOHFZ4JE74A757IMXZOHDDRLYPVZFDR7A2` | `CBC2AFPV7NFT63FFFZT5IVNIPIEEA6JHQBFQZGTNUQIVQKNY5HBZYWJE` |
| 100   | `CB5C4ULIVLFL3B3FBX5EPEZAAE5G7NPU3TDMEKPSEVUFTIHBONN6COA6` | `CCEXO6VBGW6MJNURQ5VKX2ONXMMWQLUYMXCPIODOZAUC6CTBME7U55NA` |
| 250   | `CCV7XJXWJYDS7OWUATOIWJM7O7SXT2YLE3TFE5HFXJZ275FUDBXCMPR2` | `CCL43X4PAIBFSXSQKEVE35O3MDPOGXCOU5EAY6CVYW6BW2EN6LZHJKP2` |
| 500   | `CDCRLJV6JXTUOUZNAWMGBC73FUDR43C7QLXIV6LL66ZEQMLFIGMWAPVR` | `CBM6WVWGTCAGTYVLRPHO6TYWDI2NNFE6UY3G5HU6LQ6RBDUZWKCXQ7JD` |
| 1000  | `CCVOVLQBPSS4HAYDMHSUX522Z3DVXULDMKCBSTIOHF3PC6Q4FQEJRFVD` | `CAIK5SEX5SJJ3AJOIQFTLUTA3VA3NCTFIP7LCNUVH6WKLW4AYT7CCC57` |

> All contract IDs above were confirmed **live on testnet** via `getLedgerEntries` on `soroban-testnet.stellar.org` — every contract instance is present on-chain. Redeploy with `./scripts/deploy.sh`; deployed IDs are written to `.env` / `app/.env.local`.

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
