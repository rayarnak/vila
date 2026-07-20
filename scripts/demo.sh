#!/bin/bash
set -euo pipefail

echo "============================================"
echo "  Vila Protocol — End-to-End Demo"
echo "============================================"
echo ""

cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load env
if [ -f .env ]; then
    source .env
fi

# Check for circuit artifacts
if [ ! -f circuits/build/withdraw_js/withdraw.wasm ]; then
    echo -e "${BLUE}[Step 1]${NC} Compiling ZK circuit..."
    bash scripts/compile-circuit.sh

    echo ""
    echo -e "${BLUE}[Step 2]${NC} Running trusted setup ceremony..."
    bash scripts/setup-ceremony.sh
else
    echo -e "${GREEN}[Skip]${NC} Circuit artifacts already exist"
fi

# Check contracts are built
if [ ! -f contracts/target/wasm32v1-none/release/vila_pool.wasm ]; then
    echo ""
    echo -e "${BLUE}[Build]${NC} Building Soroban contracts..."
    cd contracts && stellar contract build && cd ..
else
    echo -e "${GREEN}[Skip]${NC} Contract WASMs already built"
fi

echo ""
echo -e "${BLUE}[Mode]${NC} Select demo mode:"
echo "  1) Programmatic E2E (deposit → proof → withdraw via script)"
echo "  2) Interactive (start relayer + frontend, use browser)"
echo ""

MODE="${1:-1}"
if [ "$MODE" = "2" ] || [ "$MODE" = "interactive" ]; then
    # ── Interactive mode: start services ──
    echo -e "${BLUE}[Services]${NC} Starting relayer + frontend..."

    echo "  Starting relayer on :3001..."
    npm run relayer &
    RELAYER_PID=$!

    sleep 2

    echo "  Starting frontend on :3000..."
    npm run dev &
    APP_PID=$!

    sleep 3

    echo ""
    echo -e "${GREEN}=== Demo Ready ===${NC}"
    echo ""
    echo -e "  Frontend:   ${YELLOW}http://localhost:3000${NC}"
    echo -e "  Relayer:    ${YELLOW}http://localhost:3001/health${NC}"
    echo ""
    echo "  1. Open http://localhost:3000/deposit to deposit XLM"
    echo "  2. Copy the secret note"
    echo "  3. Open http://localhost:3000/withdraw to withdraw"
    echo "  4. Open http://localhost:3000/compliance for viewing key demo"
    echo ""
    echo "Press Ctrl+C to stop."

    cleanup() {
        echo ""
        echo "Stopping services..."
        kill $RELAYER_PID 2>/dev/null || true
        kill $APP_PID 2>/dev/null || true
        echo "Done."
    }
    trap cleanup EXIT
    wait
else
    # ── Programmatic E2E demo ──
    echo -e "${BLUE}[E2E]${NC} Running programmatic deposit → proof → withdraw..."
    echo ""
    npx tsx scripts/demo-e2e.ts
fi
