#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Circuit Compilation ==="

cd "$(dirname "$0")/.."

# Check dependencies
if ! command -v circom &> /dev/null; then
    echo "Error: circom not found. Install: https://docs.circom.io/getting-started/installation/"
    exit 1
fi

# Install circomlib if not present
if [ ! -d "circuits/node_modules/circomlib" ]; then
    echo "[1/3] Installing circomlib..."
    cd circuits
    npm init -y 2>/dev/null || true
    npm install circomlib
    cd ..
else
    echo "[1/3] circomlib already installed"
fi

# Compile circuit
echo "[2/3] Compiling withdraw.circom..."
mkdir -p circuits/build
circom circuits/withdraw.circom \
    --r1cs \
    --wasm \
    --sym \
    --output circuits/build \
    -l circuits/node_modules

echo "[3/3] Circuit compiled successfully!"
echo "  R1CS:  circuits/build/withdraw.r1cs"
echo "  WASM:  circuits/build/withdraw_js/withdraw.wasm"
echo "  SYM:   circuits/build/withdraw.sym"

# Print circuit info
echo ""
echo "Circuit info:"
npx snarkjs r1cs info circuits/build/withdraw.r1cs
