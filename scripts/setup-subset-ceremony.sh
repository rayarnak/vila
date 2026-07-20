#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Subset Circuit Trusted Setup ==="

cd "$(dirname "$0")/.."

# Check dependencies
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Install Node.js >= 18."
    exit 1
fi

CIRCUIT_DIR="circuits/build"
R1CS="$CIRCUIT_DIR/subset.r1cs"

if [ ! -f "$R1CS" ]; then
    echo "Error: R1CS not found. Run ./scripts/compile-subset.sh first."
    exit 1
fi

# Reuse existing ptau if available (needs >= 2^10 for subset circuit)
PTAU="$CIRCUIT_DIR/pot15_final.ptau"

if [ ! -f "$PTAU" ]; then
    echo "[1/5] Starting Powers of Tau ceremony (bn128, 2^12)..."
    npx snarkjs powersoftau new bn128 12 "$CIRCUIT_DIR/subset_pot12_0000.ptau" -v

    echo "[2/5] Contributing to ceremony..."
    npx snarkjs powersoftau contribute "$CIRCUIT_DIR/subset_pot12_0000.ptau" "$CIRCUIT_DIR/subset_pot12_0001.ptau" \
        --name="Vila Subset Phase 1" -v -e="$(head -c 64 /dev/urandom | xxd -p)"

    echo "[3/5] Preparing phase 2..."
    npx snarkjs powersoftau prepare phase2 "$CIRCUIT_DIR/subset_pot12_0001.ptau" "$CIRCUIT_DIR/subset_pot12_final.ptau" -v

    PTAU="$CIRCUIT_DIR/subset_pot12_final.ptau"
else
    echo "[1/5] Reusing existing Powers of Tau (pot15_final.ptau)"
    echo "[2/5] Skipping (reusing existing ptau)"
    echo "[3/5] Skipping (reusing existing ptau)"
fi

echo "[4/5] Generating circuit-specific zkey..."
npx snarkjs groth16 setup "$R1CS" "$PTAU" "$CIRCUIT_DIR/subset_0001.zkey"

echo "[5/5] Contributing to phase 2..."
npx snarkjs zkey contribute "$CIRCUIT_DIR/subset_0001.zkey" "$CIRCUIT_DIR/subset_final.zkey" \
    --name="Vila Subset Phase 2" -v -e="$(head -c 64 /dev/urandom | xxd -p)"

# Export verification key
npx snarkjs zkey export verificationkey "$CIRCUIT_DIR/subset_final.zkey" "$CIRCUIT_DIR/subset_verification_key.json"

echo ""
echo "=== Subset ceremony complete! ==="
echo "  Final zkey:         $CIRCUIT_DIR/subset_final.zkey"
echo "  Verification key:   $CIRCUIT_DIR/subset_verification_key.json"
echo ""
echo "Copy assets to app/public/circuits/ for browser use:"
echo "  cp $CIRCUIT_DIR/subset_js/subset.wasm app/public/circuits/"
echo "  cp $CIRCUIT_DIR/subset_final.zkey app/public/circuits/"
echo "  cp $CIRCUIT_DIR/subset_verification_key.json app/public/circuits/"
