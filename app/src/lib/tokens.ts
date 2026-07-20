/**
 * Supported tokens and denomination tiers for the Vila shielded pool.
 *
 * Each pool contract instance has a fixed denomination (privacy pool design).
 * Multiple denominations = multiple deployed pool contracts per token.
 */

export interface SupportedToken {
  symbol: string;
  name: string;
  decimals: number;
  /** Stellar Asset Contract ID */
  tokenId: string;
  /** Icon color for UI */
  color: string;
  bgColor: string;
}

export interface PoolTier {
  /** Human-readable amount (e.g., "10 XLM") */
  label: string;
  /** Amount in smallest unit (stroops) */
  amount: string;
  /** Pool contract ID for this denomination */
  poolId: string;
  /** Parent token symbol */
  tokenSymbol: string;
}

export interface PoolTierSplit {
  tier: PoolTier;
  count: number;
}

export interface PoolAmountBreakdown {
  requestedRaw: bigint;
  coveredRaw: bigint;
  remainderRaw: bigint;
  splits: PoolTierSplit[];
}

// ── Token definitions ──

export const SUPPORTED_TOKENS: SupportedToken[] = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
    tokenId:
      process.env.NEXT_PUBLIC_XLM_TOKEN_ID ||
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 7,
    tokenId: process.env.NEXT_PUBLIC_USDC_TOKEN_ID || "",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 7,
    tokenId: process.env.NEXT_PUBLIC_USDT_TOKEN_ID || "",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
  },
];

// ── Pool tiers (denomination → pool contract) ──

export const POOL_TIERS: PoolTier[] = [
  // XLM tiers
  {
    label: "1 XLM",
    amount: "10000000",        // 1 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_1 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "5 XLM",
    amount: "50000000",        // 5 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_5 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "10 XLM",
    amount: "100000000",       // 10 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_10 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "50 XLM",
    amount: "500000000",       // 50 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_50 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "100 XLM",
    amount: "1000000000",      // 100 * 10^7
    poolId:
      process.env.NEXT_PUBLIC_XLM_POOL_100 ||
      process.env.NEXT_PUBLIC_XLM_POOL_ID ||
      process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ||
      "",
    tokenSymbol: "XLM",
  },
  {
    label: "250 XLM",
    amount: "2500000000",      // 250 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_250 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "500 XLM",
    amount: "5000000000",      // 500 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_500 || "",
    tokenSymbol: "XLM",
  },
  {
    label: "1,000 XLM",
    amount: "10000000000",     // 1000 * 10^7
    poolId: process.env.NEXT_PUBLIC_XLM_POOL_1000 || "",
    tokenSymbol: "XLM",
  },
  // USDC tiers
  {
    label: "1 USDC",
    amount: "10000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_1 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "5 USDC",
    amount: "50000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_5 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "10 USDC",
    amount: "100000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_10 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "50 USDC",
    amount: "500000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_50 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "100 USDC",
    amount: "1000000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_100 || process.env.NEXT_PUBLIC_USDC_POOL_ID || "",
    tokenSymbol: "USDC",
  },
  {
    label: "250 USDC",
    amount: "2500000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_250 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "500 USDC",
    amount: "5000000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_500 || "",
    tokenSymbol: "USDC",
  },
  {
    label: "1,000 USDC",
    amount: "10000000000",
    poolId: process.env.NEXT_PUBLIC_USDC_POOL_1000 || "",
    tokenSymbol: "USDC",
  },
  // USDT tiers
  {
    label: "1 USDT",
    amount: "10000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_1 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "5 USDT",
    amount: "50000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_5 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "10 USDT",
    amount: "100000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_10 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "50 USDT",
    amount: "500000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_50 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "100 USDT",
    amount: "1000000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_100 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "250 USDT",
    amount: "2500000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_250 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "500 USDT",
    amount: "5000000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_500 || "",
    tokenSymbol: "USDT",
  },
  {
    label: "1,000 USDT",
    amount: "10000000000",
    poolId: process.env.NEXT_PUBLIC_USDT_POOL_1000 || "",
    tokenSymbol: "USDT",
  },
];

// ── Helpers ──

/** Get tokens that have at least one deployed pool tier */
export function getActiveTokens(): SupportedToken[] {
  const activeSymbols = new Set(
    POOL_TIERS.filter((t) => t.poolId).map((t) => t.tokenSymbol)
  );
  return SUPPORTED_TOKENS.filter((t) => activeSymbols.has(t.symbol));
}

/** Get deployed pool tiers for a token */
export function getPoolTiers(symbol: string): PoolTier[] {
  return POOL_TIERS.filter((t) => t.tokenSymbol === symbol && t.poolId);
}

/** Get all deployed pool tiers across all tokens */
export function getAllActiveTiers(): PoolTier[] {
  return POOL_TIERS.filter((t) => t.poolId);
}

/** Get a specific token definition */
export function getToken(symbol: string): SupportedToken | undefined {
  return SUPPORTED_TOKENS.find((t) => t.symbol === symbol);
}

/** Find a pool tier by its contract ID */
export function findTierByPoolId(poolId: string): PoolTier | undefined {
  return POOL_TIERS.find((t) => t.poolId === poolId);
}

export function parseTokenAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const [whole, fractional = ""] = normalized.split(".");
  if (fractional.length > decimals) return null;

  const paddedFractional = fractional.padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFractional || "0");
}

export function formatTokenAmount(raw: bigint, decimals: number, symbol: string): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fractional = raw % scale;
  const suffix = symbol ? ` ${symbol}` : "";

  if (fractional === 0n) {
    return `${whole.toLocaleString()}${suffix}`;
  }

  const fractionalText = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fractionalText}${suffix}`;
}

export function decomposePoolAmount(
  amountRaw: bigint,
  tiers: PoolTier[]
): PoolAmountBreakdown {
  let remainder = amountRaw;
  const splits: PoolTierSplit[] = [];

  const sortedTiers = [...tiers].sort((a, b) => {
    const diff = BigInt(b.amount) - BigInt(a.amount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });

  for (const tier of sortedTiers) {
    const tierAmount = BigInt(tier.amount);
    if (tierAmount <= 0n || remainder < tierAmount) continue;

    const count = remainder / tierAmount;
    if (count > 0n) {
      splits.push({ tier, count: Number(count) });
      remainder -= count * tierAmount;
    }
  }

  return {
    requestedRaw: amountRaw,
    coveredRaw: amountRaw - remainder,
    remainderRaw: remainder,
    splits,
  };
}

// ── Swap pairs ──

export interface SwapPair {
  tokenIn: string;
  tokenOut: string;
  rate: number;
  rateBps: number;
}

const SWAP_PAIRS: SwapPair[] = [
  { tokenIn: "XLM", tokenOut: "USDC", rate: 0.12, rateBps: 1200 },
  { tokenIn: "USDC", tokenOut: "XLM", rate: 8.33, rateBps: 83300 },
  { tokenIn: "XLM", tokenOut: "USDT", rate: 0.12, rateBps: 1200 },
  { tokenIn: "USDT", tokenOut: "XLM", rate: 8.33, rateBps: 83300 },
  { tokenIn: "USDC", tokenOut: "USDT", rate: 1.0, rateBps: 10000 },
  { tokenIn: "USDT", tokenOut: "USDC", rate: 1.0, rateBps: 10000 },
];

export function getSwapPairs(fromSymbol?: string): SwapPair[] {
  if (fromSymbol) {
    return SWAP_PAIRS.filter((p) => p.tokenIn === fromSymbol);
  }
  return SWAP_PAIRS;
}

// ── Legacy compat (used by existing pages) ──

export type { SupportedToken as LegacyToken };
