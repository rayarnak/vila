/* ── Ramp Adapter ─────────────────────────────────────────────
   Clean interface for fiat on-ramp / off-ramp providers.

   On-ramp:  External (Coinbase, Moonpay, etc) → user buys crypto
   Off-ramp: CheesePay (https://cheesepay.xyz) → converts USDC/XLM to local currency
   ──────────────────────────────────────────────────────────── */

export interface RampResult {
  success: boolean;
  txId: string;
  amount: number;
  currency: string;
  timestamp: number;
  message?: string;
}

export interface RampQuote {
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  rate: number;
  fee: number;
  expiresAt: number;
}

export interface RampStatusResult {
  status: "pending" | "processing" | "completed" | "failed";
  txId: string;
  message?: string;
  settledAmount?: number;
  settledCurrency?: string;
}

export interface RampProvider {
  name: string;

  onRamp(params: {
    amount: number;
    currency: string;
    targetToken: string;
    walletAddress?: string;
  }): Promise<RampResult>;

  offRamp(params: {
    amount: number;
    token: string;
    targetCurrency: string;
    recipient: string;       // bank account or phone number
    recipientName?: string;
    bankCode?: string;
  }): Promise<RampResult>;

  getQuote(params: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
  }): Promise<RampQuote>;

  /** Generate an on-ramp deep link for the user to buy USDC */
  getOnRampUrl(params: {
    amount: number;
    currency: string;
    walletAddress: string;
  }): string;

  /** Poll settler API for settlement progress */
  getStatus(txId: string): Promise<RampStatusResult>;
}

/* ── CheesePay Off-Ramp Provider ─────────────────────────────
   Connects to CheesePay (https://cheesepay.xyz) for real payouts.

   Configure via environment variables:
     NEXT_PUBLIC_OFFRAMP_API_URL  — CheesePay API base URL
     OFFRAMP_API_KEY              — your CheesePay API key
   ──────────────────────────────────────────────────────────── */

const OFFRAMP_API_URL = process.env.NEXT_PUBLIC_OFFRAMP_API_URL || "";
const OFFRAMP_API_KEY = process.env.OFFRAMP_API_KEY || "";

export class SettlerRampProvider implements RampProvider {
  name = "CheesePay";

  async onRamp(params: {
    amount: number;
    currency: string;
    targetToken: string;
  }): Promise<RampResult> {
    // On-ramp is handled externally (user buys from exchange).
    // This returns a simulated result for the UI visualization.
    await new Promise((r) => setTimeout(r, 1500));
    return {
      success: true,
      txId: `onramp_${Date.now().toString(36)}`,
      amount: params.amount,
      currency: params.targetToken,
      timestamp: Date.now(),
      message: `On-ramp: ${params.amount} ${params.currency} → ${params.targetToken}`,
    };
  }

  async offRamp(params: {
    amount: number;
    token: string;
    targetCurrency: string;
    recipient: string;
    recipientName?: string;
    bankCode?: string;
  }): Promise<RampResult> {
    // If no API URL configured, fall back to simulation
    if (!OFFRAMP_API_URL) {
      return this.simulatedOffRamp(params);
    }

    // ── Real settler API call ──
    const res = await fetch(`${OFFRAMP_API_URL}/settle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OFFRAMP_API_KEY ? { Authorization: `Bearer ${OFFRAMP_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        amount: params.amount,
        token: params.token,
        targetCurrency: params.targetCurrency,
        recipient: params.recipient,
        recipientName: params.recipientName,
        bankCode: params.bankCode,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      return {
        success: false,
        txId: "",
        amount: params.amount,
        currency: params.targetCurrency,
        timestamp: Date.now(),
        message: `Settlement failed: ${err}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      txId: data.transactionId || data.txId || data.id || `settle_${Date.now().toString(36)}`,
      amount: data.settledAmount || params.amount,
      currency: params.targetCurrency,
      timestamp: Date.now(),
      message: data.message || `Settled ${params.amount} ${params.targetCurrency} to ${params.recipient}`,
    };
  }

  async getQuote(params: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
  }): Promise<RampQuote> {
    // Try real quote from settler API
    if (OFFRAMP_API_URL) {
      try {
        const res = await fetch(`${OFFRAMP_API_URL}/quote`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(OFFRAMP_API_KEY ? { Authorization: `Bearer ${OFFRAMP_API_KEY}` } : {}),
          },
          body: JSON.stringify({
            amount: params.amount,
            fromCurrency: params.fromCurrency,
            toCurrency: params.toCurrency,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          return {
            fromAmount: params.amount,
            fromCurrency: params.fromCurrency,
            toAmount: data.receiveAmount || data.toAmount,
            toCurrency: params.toCurrency,
            rate: data.rate || data.exchangeRate,
            fee: data.fee || 0,
            expiresAt: data.expiresAt || Date.now() + 60_000,
          };
        }
      } catch {
        // Fall through to static quote
      }
    }

    // Static fallback quote
    const fee = params.amount * 0.005; // 0.5%
    return {
      fromAmount: params.amount,
      fromCurrency: params.fromCurrency,
      toAmount: params.amount - fee,
      toCurrency: params.toCurrency,
      rate: 1,
      fee,
      expiresAt: Date.now() + 60_000,
    };
  }

  getOnRampUrl(params: {
    amount: number;
    currency: string;
    walletAddress: string;
  }): string {
    // Coinbase Pay deep link with wallet pre-fill
    const cbUrl = new URL("https://pay.coinbase.com/buy/select-asset");
    cbUrl.searchParams.set("appId", "vila-protocol");
    cbUrl.searchParams.set("destinationWallets", JSON.stringify([
      { address: params.walletAddress, blockchains: ["stellar"] },
    ]));
    cbUrl.searchParams.set("defaultAsset", "USDC");
    cbUrl.searchParams.set("presetFiatAmount", String(params.amount));
    cbUrl.searchParams.set("fiatCurrency", params.currency);
    return cbUrl.toString();
  }

  async getStatus(txId: string): Promise<RampStatusResult> {
    if (!OFFRAMP_API_URL) {
      // Simulated status for dev mode
      return {
        status: "completed",
        txId,
        message: "Simulated settlement complete",
      };
    }

    const res = await fetch(`${OFFRAMP_API_URL}/status/${txId}`, {
      headers: {
        ...(OFFRAMP_API_KEY ? { Authorization: `Bearer ${OFFRAMP_API_KEY}` } : {}),
      },
    });

    if (!res.ok) {
      return {
        status: "failed",
        txId,
        message: "Failed to fetch status",
      };
    }

    const data = await res.json();
    return {
      status: data.status || "pending",
      txId,
      message: data.message,
      settledAmount: data.settledAmount,
      settledCurrency: data.settledCurrency,
    };
  }

  private async simulatedOffRamp(params: {
    amount: number;
    targetCurrency: string;
    recipient: string;
  }): Promise<RampResult> {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      success: true,
      txId: `sim_${Date.now().toString(36)}`,
      amount: params.amount,
      currency: params.targetCurrency,
      timestamp: Date.now(),
      message: `Simulated: ${params.amount} ${params.targetCurrency} to ${params.recipient}`,
    };
  }
}

/* ── Default export ────────────────────────────────────────── */

const rampProvider: RampProvider = new SettlerRampProvider();
export default rampProvider;
