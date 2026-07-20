export interface RelayRequest {
  proofA: string; // hex
  proofB: string; // hex
  proofC: string; // hex
  root: string;
  nullifierHash: string;
  recipient: string;
  fee: string;
}

export interface SwapRelayRequest extends RelayRequest {
  tokenOut: string;
  minAmountOut: string;
}

export interface RelayResponse {
  success: boolean;
  txHash?: string;
  error?: string;
  queuePosition?: number;
  estimatedDelay?: number; // seconds
}

/**
 * Client for the Vila relayer service.
 * Submits withdrawal proofs to the relayer, which submits them on-chain
 * on behalf of the user (preserving privacy by breaking the link between
 * the user's IP/wallet and the withdrawal).
 */
export class RelayerClient {
  private baseUrl: string;

  constructor(relayerUrl: string) {
    this.baseUrl = relayerUrl.replace(/\/$/, "");
  }

  /**
   * Submit a withdrawal request to the relayer.
   */
  async submitWithdrawal(request: RelayRequest): Promise<RelayResponse> {
    const response = await fetch(`${this.baseUrl}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return (await response.json()) as RelayResponse;
  }

  /**
   * Submit a swap withdrawal request — withdraw and swap to a different token.
   */
  async submitSwapWithdrawal(request: SwapRelayRequest): Promise<RelayResponse> {
    const response = await fetch(`${this.baseUrl}/relay-swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return (await response.json()) as RelayResponse;
  }

  /**
   * Check the status of a pending withdrawal by nullifier hash.
   */
  async getStatus(nullifierHash: string): Promise<{
    status: "pending" | "submitted" | "confirmed" | "failed";
    txHash?: string;
    error?: string;
  }> {
    const response = await fetch(
      `${this.baseUrl}/status/${nullifierHash}`
    );
    return (await response.json()) as {
      status: "pending" | "submitted" | "confirmed" | "failed";
      txHash?: string;
      error?: string;
    };
  }

  /**
   * Get relayer info (fee, supported denominations, etc.).
   */
  async getInfo(): Promise<{
    feeBps: number;
    poolContractId: string;
    supportedDenominations: string[];
  }> {
    const response = await fetch(`${this.baseUrl}/info`);
    return (await response.json()) as {
      feeBps: number;
      poolContractId: string;
      supportedDenominations: string[];
    };
  }
}
