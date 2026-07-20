export interface QueueItem {
  id: string;
  data: unknown;
  addedAt: number;
  executeAt: number;
  status: "pending" | "processing" | "done" | "failed";
  result?: unknown;
  error?: string;
}

/**
 * Random delay queue for anti-correlation.
 * Adds a random delay (30s–5min) between receiving a withdrawal request
 * and submitting it on-chain, making it harder to correlate deposits
 * with withdrawals by timing analysis.
 */
export class DelayQueue {
  private queue: Map<string, QueueItem> = new Map();
  private processor: (item: QueueItem) => Promise<unknown>;
  private minDelayMs: number;
  private maxDelayMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    processor: (item: QueueItem) => Promise<unknown>,
    minDelayMs = 30_000,   // 30 seconds
    maxDelayMs = 300_000   // 5 minutes
  ) {
    this.processor = processor;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  /**
   * Add an item to the queue with a random delay.
   */
  add(id: string, data: unknown): QueueItem {
    const delay =
      this.minDelayMs +
      Math.random() * (this.maxDelayMs - this.minDelayMs);

    const item: QueueItem = {
      id,
      data,
      addedAt: Date.now(),
      executeAt: Date.now() + delay,
      status: "pending",
    };

    this.queue.set(id, item);
    this.scheduleNext();
    return item;
  }

  /**
   * Get item status by ID.
   */
  get(id: string): QueueItem | undefined {
    return this.queue.get(id);
  }

  /**
   * Start processing the queue.
   */
  start(): void {
    this.scheduleNext();
  }

  /**
   * Stop processing.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);

    // Find the next pending item
    let nextItem: QueueItem | null = null;
    for (const item of this.queue.values()) {
      if (item.status === "pending") {
        if (!nextItem || item.executeAt < nextItem.executeAt) {
          nextItem = item;
        }
      }
    }

    if (!nextItem) return;

    const delay = Math.max(0, nextItem.executeAt - Date.now());
    const itemId = nextItem.id;

    this.timer = setTimeout(async () => {
      const item = this.queue.get(itemId);
      if (!item || item.status !== "pending") {
        this.scheduleNext();
        return;
      }

      item.status = "processing";
      try {
        item.result = await this.processor(item);
        item.status = "done";
      } catch (err) {
        item.status = "failed";
        item.error = err instanceof Error ? err.message : String(err);
      }

      this.scheduleNext();
    }, delay);
  }
}
