#!/bin/bash
set -euo pipefail

echo "=== Vila Protocol — Trusted Setup Ceremony ==="

cd "$(dirname "$0")/.."

# Check dependencies
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Install Node.js >= 18."
    exit 1
fi

CIRCUIT_DIR="circuits/build"
R1CS="$CIRCUIT_DIR/withdraw.r1cs"

if [ ! -f "$R1CS" ]; then
    echo "Error: R1CS not found. Run ./scripts/compile-circuit.sh first."
    exit 1
fi

echo "[1/5] Starting Powers of Tau ceremony (bn128, 2^15)..."
npx snarkjs powersoftau new bn128 15 "$CIRCUIT_DIR/pot15_0000.ptau" -v

echo "[2/5] Contributing to ceremony..."
npx snarkjs powersoftau contribute "$CIRCUIT_DIR/pot15_0000.ptau" "$CIRCUIT_DIR/pot15_0001.ptau" \
    --name="Vila Protocol Phase 1" -v -e="$(head -c 64 /dev/urandom | xxd -p)"

echo "[3/5] Preparing phase 2..."
npx snarkjs powersoftau prepare phase2 "$CIRCUIT_DIR/pot15_0001.ptau" "$CIRCUIT_DIR/pot15_final.ptau" -v

echo "[4/5] Generating circuit-specific zkey..."
npx snarkjs groth16 setup "$R1CS" "$CIRCUIT_DIR/pot15_final.ptau" "$CIRCUIT_DIR/withdraw_0001.zkey"

echo "[5/5] Contributing to phase 2..."
npx snarkjs zkey contribute "$CIRCUIT_DIR/withdraw_0001.zkey" "$CIRCUIT_DIR/withdraw_final.zkey" \
    --name="Vila Protocol Phase 2" -v -e="$(head -c 64 /dev/urandom | xxd -p)"

# Export verification key
npx snarkjs zkey export verificationkey "$CIRCUIT_DIR/withdraw_final.zkey" "$CIRCUIT_DIR/verification_key.json"

echo ""
echo "=== Ceremony complete! ==="
echo "  Final zkey:         $CIRCUIT_DIR/withdraw_final.zkey"
echo "  Verification key:   $CIRCUIT_DIR/verification_key.json"
echo ""
echo "Copy verification_key.json to circuits/ for the verifier contract:"
echo "  cp $CIRCUIT_DIR/verification_key.json circuits/verification_key.json"
