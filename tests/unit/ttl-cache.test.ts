import { describe, expect, it } from "vitest";

import { TtlLruCache } from "../../src/utils/ttlCache.js";

describe("TTL LRU cache", () => {
  it("returns stored values until they expire", () => {
    let now = 1000;
    const cache = new TtlLruCache({ ttlMs: 100, maxBytes: 1000, now: () => now });

    cache.set("a", "alpha");
    expect(cache.get("a")).toBe("alpha");

    now = 1101;
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the least recently used entry when over the byte budget", () => {
    const cache = new TtlLruCache({ ttlMs: 60_000, maxBytes: 10 });

    cache.set("a", "12345");
    cache.set("b", "12345");
    cache.get("a");
    cache.set("c", "12345");

    expect(cache.get("a")).toBe("12345");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("12345");
  });

  it("does not store values larger than the whole budget", () => {
    const cache = new TtlLruCache({ ttlMs: 60_000, maxBytes: 4 });
    cache.set("a", "12345");
    expect(cache.get("a")).toBeUndefined();
  });

  it("stores nothing when the TTL is zero", () => {
    const cache = new TtlLruCache({ ttlMs: 0, maxBytes: 1000 });
    cache.set("a", "alpha");
    expect(cache.get("a")).toBeUndefined();
  });
});
