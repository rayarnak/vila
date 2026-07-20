import rampProvider from "./ramp";
import type { RampQuote } from "./ramp";

/* ── Corridor Model ────────────────────────────────────────── */

export interface Bank {
  code: string;
  name: string;
}

export interface OnRampLink {
  name: string;
  url: string;
}

export interface Corridor {
  id: string;
  from: { currency: string; country: string; flag: string };
  to: { currency: string; country: string; flag: string };
  onRampLinks: OnRampLink[];
  banks: Bank[];
  estimatedMinutes: number;
}

/* ── Corridors ─────────────────────────────────────────────── */

const CORRIDORS: Corridor[] = [
  {
    id: "usd-ngn",
    from: { currency: "USD", country: "United States", flag: "🇺🇸" },
    to: { currency: "NGN", country: "Nigeria", flag: "🇳🇬" },
    onRampLinks: [
      { name: "Coinbase", url: "https://www.coinbase.com/buy/usdc" },
      { name: "Moonpay", url: "https://www.moonpay.com/buy/usdc" },
    ],
    banks: [
      { code: "044", name: "Access Bank" },
      { code: "063", name: "Diamond (Access)" },
      { code: "050", name: "Ecobank" },
      { code: "070", name: "Fidelity Bank" },
      { code: "011", name: "First Bank" },
      { code: "058", name: "GTBank" },
      { code: "030", name: "Heritage Bank" },
      { code: "301", name: "Jaiz Bank" },
      { code: "082", name: "Keystone Bank" },
      { code: "526", name: "Kuda Bank" },
      { code: "100004", name: "Opay" },
      { code: "100002", name: "Paga" },
      { code: "999991", name: "PalmPay" },
      { code: "076", name: "Polaris Bank" },
      { code: "101", name: "Providus Bank" },
      { code: "125", name: "Rubies Bank" },
      { code: "039", name: "Stanbic IBTC" },
      { code: "232", name: "Sterling Bank" },
      { code: "032", name: "Union Bank" },
      { code: "033", name: "UBA" },
      { code: "215", name: "Unity Bank" },
      { code: "035", name: "Wema Bank" },
      { code: "057", name: "Zenith Bank" },
    ],
    estimatedMinutes: 5,
  },
  {
    id: "eur-ngn",
    from: { currency: "EUR", country: "Europe", flag: "🇪🇺" },
    to: { currency: "NGN", country: "Nigeria", flag: "🇳🇬" },
    onRampLinks: [
      { name: "Coinbase", url: "https://www.coinbase.com/buy/usdc" },
      { name: "Moonpay", url: "https://www.moonpay.com/buy/usdc" },
    ],
    banks: [
      { code: "044", name: "Access Bank" },
      { code: "011", name: "First Bank" },
      { code: "058", name: "GTBank" },
      { code: "526", name: "Kuda Bank" },
      { code: "100004", name: "Opay" },
      { code: "999991", name: "PalmPay" },
      { code: "033", name: "UBA" },
      { code: "057", name: "Zenith Bank" },
    ],
    estimatedMinutes: 5,
  },
  {
    id: "gbp-ngn",
    from: { currency: "GBP", country: "United Kingdom", flag: "🇬🇧" },
    to: { currency: "NGN", country: "Nigeria", flag: "🇳🇬" },
    onRampLinks: [
      { name: "Coinbase", url: "https://www.coinbase.com/buy/usdc" },
      { name: "Moonpay", url: "https://www.moonpay.com/buy/usdc" },
    ],
    banks: [
      { code: "044", name: "Access Bank" },
      { code: "011", name: "First Bank" },
      { code: "058", name: "GTBank" },
      { code: "526", name: "Kuda Bank" },
      { code: "100004", name: "Opay" },
      { code: "999991", name: "PalmPay" },
      { code: "033", name: "UBA" },
      { code: "057", name: "Zenith Bank" },
    ],
    estimatedMinutes: 5,
  },
  {
    id: "usd-kes",
    from: { currency: "USD", country: "United States", flag: "🇺🇸" },
    to: { currency: "KES", country: "Kenya", flag: "🇰🇪" },
    onRampLinks: [
      { name: "Coinbase", url: "https://www.coinbase.com/buy/usdc" },
      { name: "Moonpay", url: "https://www.moonpay.com/buy/usdc" },
    ],
    banks: [
      { code: "MPESA", name: "M-Pesa" },
      { code: "EQUITY", name: "Equity Bank" },
      { code: "KCB", name: "KCB" },
    ],
    estimatedMinutes: 5,
  },
];

/* ── Public API ────────────────────────────────────────────── */

export function getCorridors(): Corridor[] {
  return CORRIDORS;
}

export function getCorridor(id: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.id === id);
}

/**
 * Fetch a live quote from the settler API (falls back to static rates).
 */
export async function getQuote(
  corridorId: string,
  amount: number
): Promise<RampQuote | null> {
  const corridor = getCorridor(corridorId);
  if (!corridor) return null;
  return rampProvider.getQuote({
    amount,
    fromCurrency: "USDC",
    toCurrency: corridor.to.currency,
  });
}
