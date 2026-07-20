import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { DelayQueue, type QueueItem } from "./queue";
import {
  submitWithdrawal,
  submitSwapWithdrawal,
  type WithdrawParams,
  type SwapWithdrawParams,
} from "./submit";

import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const TREE_AUTH_SECRET = process.env.TREE_AUTH_SECRET || "";

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST"],
}));
app.use(express.json());

// Basic rate limiting — max 20 requests per minute per IP for relay endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > maxPerMinute;
}

const PORT = parseInt(process.env.RELAYER_PORT || "3001", 10);
const FEE_BPS = parseInt(process.env.RELAYER_FEE_BPS || "50", 10);

const config = {
  rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase:
    process.env.STELLAR_NETWORK === "mainnet"
      ? "Public Global Stellar Network ; September 2015"
      : "Test SDF Network ; September 2015",
  poolContractId: process.env.POOL_CONTRACT_ID || "",
  signerSecret: process.env.RELAYER_SECRET_KEY || "",
};

// Withdrawal results indexed by nullifier hash
const results = new Map<string, { txHash?: string; error?: string; status: string }>();

// Delay queue with random anti-correlation delay
const queue = new DelayQueue(
  async (item: QueueItem) => {
    const isSwap = !!(item.data as Record<string, unknown>).tokenOut;
    const nullifier = (item.data as WithdrawParams).nullifierHash;
    console.log(`[relayer] Processing ${isSwap ? "swap " : ""}withdrawal: ${item.id}`);

    try {
      const itemData = item.data as Record<string, unknown>;
      const itemConfig = (itemData._config as typeof config) || config;
      const txHash = isSwap
        ? await submitSwapWithdrawal(item.data as SwapWithdrawParams, itemConfig)
        : await submitWithdrawal(item.data as WithdrawParams, itemConfig);
      results.set(nullifier, { txHash, status: "confirmed" });
      console.log(`[relayer] Withdrawal confirmed: ${txHash}`);
      return txHash;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.set(nullifier, { error, status: "failed" });
      console.error(`[relayer] Withdrawal failed: ${error}`);
      throw err;
    }
  },
  // Shorter delays for testnet (5s–30s)
  process.env.NODE_ENV === "production" ? 30_000 : 5_000,
  process.env.NODE_ENV === "production" ? 300_000 : 30_000
);

/**
 * POST /relay — Submit a withdrawal request
 */
app.post("/relay", (req, res) => {
  const { proofA, proofB, proofC, root, nullifierHash, recipient, fee, poolContractId } =
    req.body as WithdrawParams & { poolContractId?: string };

  // Validate required fields
  if (!proofA || !proofB || !proofC || !root || !nullifierHash || !recipient) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  // Rate limit
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, error: "Too many requests" });
    return;
  }

  // Check for duplicate
  if (results.has(nullifierHash)) {
    const existing = results.get(nullifierHash)!;
    if (existing.status === "confirmed") {
      res.json({ success: true, txHash: existing.txHash });
      return;
    }
  }

  // Add to delay queue — override pool contract if provided
  const effectiveConfig = poolContractId
    ? { ...config, poolContractId }
    : config;
  const item = queue.add(nullifierHash, {
    proofA,
    proofB,
    proofC,
    root,
    nullifierHash,
    recipient,
    fee: fee || "0",
    _config: effectiveConfig,
  });

  results.set(nullifierHash, { status: "pending" });

  const estimatedDelay = Math.round((item.executeAt - Date.now()) / 1000);

  res.json({
    success: true,
    queuePosition: 1,
    estimatedDelay,
    message: `Withdrawal queued. Estimated processing in ${estimatedDelay}s.`,
  });
});

/**
 * POST /relay-swap — Submit a swap withdrawal request (withdraw + token swap)
 */
app.post("/relay-swap", (req, res) => {
  const { proofA, proofB, proofC, root, nullifierHash, recipient, fee, tokenOut, minAmountOut, poolContractId: swapPoolId } =
    req.body as SwapWithdrawParams & { poolContractId?: string };

  if (!proofA || !proofB || !proofC || !root || !nullifierHash || !recipient || !tokenOut) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  // Rate limit
  const swapIp = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(swapIp)) {
    res.status(429).json({ success: false, error: "Too many requests" });
    return;
  }

  if (results.has(nullifierHash)) {
    const existing = results.get(nullifierHash)!;
    if (existing.status === "confirmed") {
      res.json({ success: true, txHash: existing.txHash });
      return;
    }
  }

  const effectiveSwapConfig = swapPoolId
    ? { ...config, poolContractId: swapPoolId }
    : config;
  const item = queue.add(nullifierHash, {
    proofA,
    proofB,
    proofC,
    root,
    nullifierHash,
    recipient,
    fee: fee || "0",
    tokenOut,
    minAmountOut: minAmountOut || "0",
    _config: effectiveSwapConfig,
  });

  results.set(nullifierHash, { status: "pending" });

  const estimatedDelay = Math.round((item.executeAt - Date.now()) / 1000);

  res.json({
    success: true,
    queuePosition: 1,
    estimatedDelay,
    message: `Swap withdrawal queued. Estimated processing in ${estimatedDelay}s.`,
  });
});

/**
 * GET /status/:nullifierHash — Check withdrawal status
 */
app.get("/status/:nullifierHash", (req, res) => {
  const { nullifierHash } = req.params;
  const result = results.get(nullifierHash);

  if (!result) {
    res.status(404).json({ status: "not_found" });
    return;
  }

  res.json(result);
});

/**
 * GET /info — Relayer information
 */
app.get("/info", (_req, res) => {
  res.json({
    feeBps: FEE_BPS,
    poolContractId: config.poolContractId,
    supportedDenominations: ["100000000", "1000000000", "10000000000"],
    network: process.env.STELLAR_NETWORK || "testnet",
  });
});

/**
 * GET /tree — Return known deposit commitments for SDK tree sync.
 * Tracks deposits added via relay or reported externally.
 */
const LEAVES_FILE = path.join(process.cwd(), ".deposit-leaves.json");

function loadLeaves(): string[] {
  try {
    if (fs.existsSync(LEAVES_FILE)) {
      return JSON.parse(fs.readFileSync(LEAVES_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function saveLeaves(leaves: string[]) {
  fs.writeFileSync(LEAVES_FILE, JSON.stringify(leaves));
}

const depositLeaves: string[] = loadLeaves();

app.get("/tree", (_req, res) => {
  res.json({ leaves: depositLeaves, count: depositLeaves.length });
});

app.post("/tree/add", (req, res) => {
  // Require authentication — shared secret in Authorization header
  const authHeader = req.headers.authorization;
  if (!TREE_AUTH_SECRET || authHeader !== `Bearer ${TREE_AUTH_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { commitment } = req.body;
  if (!commitment || typeof commitment !== "string") {
    res.status(400).json({ error: "Missing or invalid commitment" });
    return;
  }
  depositLeaves.push(commitment);
  saveLeaves(depositLeaves);
  res.json({ success: true, index: depositLeaves.length - 1 });
});

/**
 * GET /health — Health check
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Start
queue.start();
app.listen(PORT, () => {
  console.log(`[relayer] Vila relayer running on :${PORT}`);
  console.log(`[relayer] Pool contract: ${config.poolContractId}`);
  console.log(`[relayer] Fee: ${FEE_BPS} bps`);
});
