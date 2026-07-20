#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Deploy 50 & 250 Pool Tiers ==="
echo ""

cd "$(dirname "$0")/.."

# Load env
if [ -f app/.env.local ]; then
    source app/.env.local
fi

NETWORK="mainnet"
RPC_URL="${NEXT_PUBLIC_STELLAR_RPC_URL:-https://mainnet.sorobanrpc.com}"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

DEPLOYER="${DEPLOYER_SECRET_KEY:?Set DEPLOYER_SECRET_KEY}"
VERIFIER_ID="${NEXT_PUBLIC_VERIFIER_CONTRACT_ID:?Set NEXT_PUBLIC_VERIFIER_CONTRACT_ID}"

XLM_TOKEN="${NEXT_PUBLIC_XLM_TOKEN_ID:?Set NEXT_PUBLIC_XLM_TOKEN_ID}"
USDC_TOKEN="${NEXT_PUBLIC_USDC_TOKEN_ID:?Set NEXT_PUBLIC_USDC_TOKEN_ID}"

WASM_HASH="8100be1db26a3d381f5f1f23917b6ea6ec712c9c41f9b962a4ca7e664dc39b64"

# Derive deployer public key
DEPLOYER_ADDR=$(node -e "const s=require('@stellar/stellar-sdk');console.log(s.Keypair.fromSecret('$DEPLOYER').publicKey())" 2>/dev/null)
if [ -z "$DEPLOYER_ADDR" ]; then
    echo "Error: Could not derive deployer address"
    exit 1
fi
echo "Deployer: $DEPLOYER_ADDR"
echo "Network:  $NETWORK"
echo "RPC:      $RPC_URL"
echo ""

ENV_FILE="app/.env.local"

deploy_pool() {
    local TOKEN_ID=$1
    local DENOMINATION=$2
    local LABEL=$3
    local ENV_KEY=$4

    echo "--- Deploying $LABEL pool (denomination: $DENOMINATION) ---"

    local POOL_ID
    POOL_ID=$(stellar contract deploy \
        --wasm-hash "$WASM_HASH" \
        --source "$DEPLOYER" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE")
    echo "  Contract: $POOL_ID"

    stellar contract invoke \
        --id "$POOL_ID" \
        --source "$DEPLOYER" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE" \
        --fee 10000000 \
        -- initialize \
        --admin "$DEPLOYER_ADDR" \
        --token "$TOKEN_ID" \
        --verifier "$VERIFIER_ID" \
        --denomination "$DENOMINATION"
    echo "  Initialized!"

    # Update .env.local in place — replace placeholder
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|${ENV_KEY}=PLACEHOLDER.*|${ENV_KEY}=${POOL_ID}|" "$ENV_FILE"
    else
        sed -i "s|${ENV_KEY}=PLACEHOLDER.*|${ENV_KEY}=${POOL_ID}|" "$ENV_FILE"
    fi
    echo "  Updated $ENV_FILE: ${ENV_KEY}=${POOL_ID}"
    echo ""
}

# ── XLM 50 & 250 ──
echo "=== XLM New Tiers ==="
deploy_pool "$XLM_TOKEN" "500000000"   "50 XLM"   "NEXT_PUBLIC_XLM_POOL_50"
deploy_pool "$XLM_TOKEN" "2500000000"  "250 XLM"  "NEXT_PUBLIC_XLM_POOL_250"

# ── USDC 50 & 250 ──
echo "=== USDC New Tiers ==="
deploy_pool "$USDC_TOKEN" "500000000"  "50 USDC"  "NEXT_PUBLIC_USDC_POOL_50"
deploy_pool "$USDC_TOKEN" "2500000000" "250 USDC" "NEXT_PUBLIC_USDC_POOL_250"

echo "=== Done! ==="
echo "Deployed 4 new pool contracts (50 & 250 for XLM + USDC)"
echo "app/.env.local has been updated with real contract IDs."
