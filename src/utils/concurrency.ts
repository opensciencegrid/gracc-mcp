/** Caps concurrent tasks; extra tasks wait in a bounded FIFO queue or are rejected. */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number
  ) {}

  public async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < Math.max(1, this.maxConcurrent)) {
      this.active += 1;
      return Promise.resolve();
    }

    if (this.waiting.length >= this.maxQueued) {
      return Promise.reject(
        new Error("The GRACC upstream is busy with other requests. Retry in a few seconds.")
      );
    }

    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
