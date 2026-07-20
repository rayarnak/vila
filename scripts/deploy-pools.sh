#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Multi-Tier Pool Deployment ==="
echo ""

cd "$(dirname "$0")/.."

# Load env
if [ -f .env ]; then
    source .env
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"

if [ "$NETWORK" = "mainnet" ]; then
    NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
else
    NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
fi

DEPLOYER="${DEPLOYER_SECRET_KEY:?Set DEPLOYER_SECRET_KEY in .env}"
VERIFIER_ID="${VERIFIER_CONTRACT_ID:?Set VERIFIER_CONTRACT_ID in .env}"

# Token SAC addresses (testnet)
XLM_TOKEN="${XLM_TOKEN_ID:-CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA}"
USDC_TOKEN="${USDC_TOKEN_ID:?Set USDC_TOKEN_ID in .env for USDC SAC address}"
USDT_TOKEN="${USDT_TOKEN_ID:-}"  # Optional

WASM_PATH="contracts/target/wasm32v1-none/release/vila_pool.optimized.wasm"

# Build if needed
if [ ! -f "$WASM_PATH" ]; then
    echo "[0] Building contracts..."
    cd contracts && stellar contract build && cd ..
fi

# Derive deployer public key from secret
DEPLOYER_ADDR=$(node -e "const s=require('@stellar/stellar-sdk');console.log(s.Keypair.fromSecret('$DEPLOYER').publicKey())" 2>/dev/null)
if [ -z "$DEPLOYER_ADDR" ]; then
    echo "Error: Could not derive deployer address from DEPLOYER_SECRET_KEY"
    exit 1
fi
echo "Deployer: $DEPLOYER_ADDR"

echo "[1] Using installed pool Wasm..."
WASM_HASH="8100be1db26a3d381f5f1f23917b6ea6ec712c9c41f9b962a4ca7e664dc39b64"
echo "  Wasm Hash: $WASM_HASH"

deploy_pool() {
    local TOKEN_SYMBOL=$1
    local TOKEN_ID=$2
    local DENOMINATION=$3
    local LABEL=$4
    local ENV_KEY=$5

    echo ""
    echo "--- Deploying $LABEL pool (denomination: $DENOMINATION) ---"

    # Deploy new instance
    local POOL_ID
    POOL_ID=$(stellar contract deploy \
        --wasm-hash "$WASM_HASH" \
        --source "$DEPLOYER" \
        --rpc-url "$RPC_URL" \
        --network-passphrase "$NETWORK_PASSPHRASE")
    echo "  Contract: $POOL_ID"

    # Initialize
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

    # Write to env file
    echo "${ENV_KEY}=${POOL_ID}" >> .env.pools
    echo "  Env: ${ENV_KEY}=${POOL_ID}"
}

# Clear previous pool env
> .env.pools
echo "# Pool contract IDs — generated $(date)" >> .env.pools
echo "" >> .env.pools

# ── XLM Pools ──
echo ""
echo "=== XLM Pools ==="
deploy_pool "XLM" "$XLM_TOKEN" "100000000"     "10 XLM"    "NEXT_PUBLIC_XLM_POOL_10"
deploy_pool "XLM" "$XLM_TOKEN" "1000000000"    "100 XLM"   "NEXT_PUBLIC_XLM_POOL_100"
deploy_pool "XLM" "$XLM_TOKEN" "5000000000"    "500 XLM"   "NEXT_PUBLIC_XLM_POOL_500"
deploy_pool "XLM" "$XLM_TOKEN" "10000000000"   "1000 XLM"  "NEXT_PUBLIC_XLM_POOL_1000"

# ── USDC Pools ──
echo ""
echo "=== USDC Pools ==="
deploy_pool "USDC" "$USDC_TOKEN" "100000000"    "10 USDC"   "NEXT_PUBLIC_USDC_POOL_10"
deploy_pool "USDC" "$USDC_TOKEN" "1000000000"   "100 USDC"  "NEXT_PUBLIC_USDC_POOL_100"
deploy_pool "USDC" "$USDC_TOKEN" "5000000000"   "500 USDC"  "NEXT_PUBLIC_USDC_POOL_500"
deploy_pool "USDC" "$USDC_TOKEN" "10000000000"  "1000 USDC" "NEXT_PUBLIC_USDC_POOL_1000"

# ── USDT Pools (if token configured) ──
if [ -n "$USDT_TOKEN" ]; then
    echo ""
    echo "=== USDT Pools ==="
    deploy_pool "USDT" "$USDT_TOKEN" "100000000"    "10 USDT"   "NEXT_PUBLIC_USDT_POOL_10"
    deploy_pool "USDT" "$USDT_TOKEN" "1000000000"   "100 USDT"  "NEXT_PUBLIC_USDT_POOL_100"
    deploy_pool "USDT" "$USDT_TOKEN" "5000000000"   "500 USDT"  "NEXT_PUBLIC_USDT_POOL_500"
    deploy_pool "USDT" "$USDT_TOKEN" "10000000000"  "1000 USDT" "NEXT_PUBLIC_USDT_POOL_1000"
else
    echo ""
    echo "Skipping USDT pools (USDT_TOKEN_ID not set)"
fi

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Pool contract IDs written to .env.pools"
echo "Copy these into your app/.env.local:"
echo ""
cat .env.pools
echo ""
echo "Also set in app/.env.local:"
echo "  NEXT_PUBLIC_XLM_TOKEN_ID=$XLM_TOKEN"
echo "  NEXT_PUBLIC_USDC_TOKEN_ID=$USDC_TOKEN"
[ -n "$USDT_TOKEN" ] && echo "  NEXT_PUBLIC_USDT_TOKEN_ID=$USDT_TOKEN"
