#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Contract Deployment ==="

cd "$(dirname "$0")/.."

# Load env
if [ -f .env ]; then
    source .env
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

if [ "$NETWORK" = "mainnet" ]; then
    NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
fi

# Check for deployer key
if [ -z "${DEPLOYER_SECRET_KEY:-}" ]; then
    echo "Error: DEPLOYER_SECRET_KEY not set. Add it to .env"
    exit 1
fi

# Build contracts
echo "[1/4] Building contracts..."
cd contracts
stellar contract build
cd ..

echo "[2/4] Deploying Groth16 Verifier..."
VERIFIER_ID=$(stellar contract deploy \
    --wasm contracts/target/wasm32v1-none/release/groth16_verifier.wasm \
    --source "$DEPLOYER_SECRET_KEY" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE")
echo "  Verifier: $VERIFIER_ID"

echo "[3/4] Deploying Vila Pool..."
POOL_ID=$(stellar contract deploy \
    --wasm contracts/target/wasm32v1-none/release/vila_pool.wasm \
    --source "$DEPLOYER_SECRET_KEY" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE")
echo "  Pool: $POOL_ID"

echo "[4/4] Writing contract IDs to .env..."
# Update .env
if [ -f .env ]; then
    sed -i.bak "s|^VERIFIER_CONTRACT_ID=.*|VERIFIER_CONTRACT_ID=$VERIFIER_ID|" .env
    sed -i.bak "s|^POOL_CONTRACT_ID=.*|POOL_CONTRACT_ID=$POOL_ID|" .env
    sed -i.bak "s|^NEXT_PUBLIC_POOL_CONTRACT_ID=.*|NEXT_PUBLIC_POOL_CONTRACT_ID=$POOL_ID|" .env
    rm -f .env.bak
fi

echo ""
echo "=== Deployment complete! ==="
echo "  Verifier Contract: $VERIFIER_ID"
echo "  Pool Contract:     $POOL_ID"
echo ""
echo "Next: Initialize the contracts:"
echo "  stellar contract invoke --id $VERIFIER_ID --source \$DEPLOYER_SECRET_KEY -- initialize ..."
echo "  stellar contract invoke --id $POOL_ID --source \$DEPLOYER_SECRET_KEY -- initialize ..."
