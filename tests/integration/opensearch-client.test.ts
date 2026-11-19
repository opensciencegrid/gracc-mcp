import { describe, expect, it, vi } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";
import { ServerConfig } from "../../src/types.js";

const INDEX = "gracc.osg.summary";

const okBody = (total = 1) =>
  JSON.stringify({
    took: 1,
    timed_out: false,
    hits: { total: { value: total, relation: "eq" }, hits: [] }
  });

const ok = (total?: number) => new Response(okBody(total), { status: 200 });

const configWith = (
  overrides: { safety?: Partial<ServerConfig["safety"]>; upstream?: Partial<ServerConfig["upstream"]> } = {}
): ServerConfig => {
  const base = loadConfig();
  return {
    ...base,
    safety: { ...base.safety, ...overrides.safety },
    upstream: { ...base.upstream, ...overrides.upstream }
  };
};

describe("OpenSearch client", () => {
  it("retries transient failures and returns JSON", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { reason: "try again" } }), { status: 503 }),
      new Response(
        JSON.stringify({
          took: 12,
          timed_out: false,
          hits: {
            total: {
              value: 1,
              relation: "eq"
            },
            hits: []
          },
          aggregations: {
            core_hours: {
              value: 123
            }
          }
        }),
        { status: 200 }
      )
    ];

    const fetchImpl = vi.fn().mockImplementation(async () => responses.shift());
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });
    const response = await client.search("gracc.osg.summary", {
      size: 0
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.aggregations?.core_hours.value).toBe(123);
  });

  it("surfaces a clear error for malformed base URLs", async () => {
    const config = loadConfig();
    const client = new OpenSearchClient(
      {
        ...config,
        baseUrl: "\"https://gracc.opensciencegrid.org/q\""
      },
      { fetchImpl: vi.fn() }
    );

    await expect(
      client.search("gracc.osg.summary", {
        size: 0
      })
    ).rejects.toThrow(/Invalid GRACC_BASE_URL/);
  });

  it("does not retry non-retryable client errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ error: { reason: "bad query" } }), { status: 400 })
      );
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow(/400 bad query/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a timed-out request", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const client = new OpenSearchClient(configWith({ safety: { requestTimeoutMs: 50 } }), {
      fetchImpl
    });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow(/timed out after 50ms/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(async () => ok());
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });

    await expect(client.search(INDEX, { size: 0 })).resolves.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a clean error when GRACC returns a non-JSON error page", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const client = new OpenSearchClient(configWith({ safety: { retryCount: 1 } }), { fetchImpl });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow(/status 502/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up instead of waiting out a long Retry-After", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { reason: "slow down" } }), {
          status: 429,
          headers: { "retry-after": "120" }
        })
    );
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects responses larger than the upstream byte cap", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response("x".repeat(5000), { status: 200 }));
    const client = new OpenSearchClient(configWith({ upstream: { maxResponseBytes: 1024 } }), {
      fetchImpl
    });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow(/exceeded 1024 bytes/);
  });

  it("serves repeated identical searches from cache", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok(7));
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });

    await client.search(INDEX, { size: 0 });
    const second = await client.search(INDEX, { size: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.hits.total?.value).toBe(7);
  });

  it("does not cache failed searches", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(
        async () => new Response(JSON.stringify({ error: { reason: "bad" } }), { status: 400 })
      )
      .mockImplementation(async () => ok());
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });

    await expect(client.search(INDEX, { size: 0 })).rejects.toThrow();
    await expect(client.search(INDEX, { size: 0 })).resolves.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent identical searches into one upstream call", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok());
    const client = new OpenSearchClient(configWith({ upstream: { cacheTtlSeconds: 0 } }), {
      fetchImpl
    });

    await Promise.all([client.search(INDEX, { size: 0 }), client.search(INDEX, { size: 0 })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects new searches when the upstream queue is full", async () => {
    let release!: () => void;
    const fetchImpl = vi.fn().mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(ok());
        })
    );
    const client = new OpenSearchClient(
      configWith({ upstream: { maxConcurrent: 1, maxQueued: 0, cacheTtlSeconds: 0 } }),
      { fetchImpl }
    );

    const first = client.search(INDEX, { size: 0 });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    await expect(client.search(INDEX, { size: 1 })).rejects.toThrow(/busy/);

    release();
    await first;
  });

  it("never exceeds the configured upstream concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return ok();
    });
    const client = new OpenSearchClient(
      configWith({ upstream: { maxConcurrent: 2, maxQueued: 10, cacheTtlSeconds: 0 } }),
      { fetchImpl }
    );

    await Promise.all(
      Array.from({ length: 6 }, (_, size) => client.search(INDEX, { size }))
    );

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBe(2);
  });
});
