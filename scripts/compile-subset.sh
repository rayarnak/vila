#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Subset Circuit Compilation ==="

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
echo "[2/3] Compiling subset.circom..."
mkdir -p circuits/build
circom circuits/subset.circom \
    --r1cs \
    --wasm \
    --sym \
    --output circuits/build \
    -l circuits/node_modules

echo "[3/3] Subset circuit compiled successfully!"
echo "  R1CS:  circuits/build/subset.r1cs"
echo "  WASM:  circuits/build/subset_js/subset.wasm"
echo "  SYM:   circuits/build/subset.sym"

# Print circuit info
echo ""
echo "Circuit info:"
npx snarkjs r1cs info circuits/build/subset.r1cs
