import { describe, expect, it } from "vitest";

import { ConcurrencyLimiter } from "../../src/utils/concurrency.js";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("concurrency limiter", () => {
  it("runs a queued task once a slot frees up", async () => {
    const limiter = new ConcurrencyLimiter(1, 5);
    const gate = deferred();
    const order: string[] = [];

    const first = limiter.run(async () => {
      await gate.promise;
      order.push("first");
    });
    const second = limiter.run(async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual([]);

    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("rejects when the queue is full", async () => {
    const limiter = new ConcurrencyLimiter(1, 0);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);

    await expect(limiter.run(async () => "late")).rejects.toThrow(/busy/);

    gate.resolve();
    await first;
  });

  it("frees the slot when a task fails", async () => {
    const limiter = new ConcurrencyLimiter(1, 0);

    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });
});
