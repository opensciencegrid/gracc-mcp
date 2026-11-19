import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";

const TRACKED_KEYS = [
  "GRACC_BASE_URL",
  "GRACC_DEFAULT_INDEX",
  "GRACC_ALLOWED_INDICES",
  "GRACC_HTTP_HOST",
  "GRACC_ENABLE_SAFE_QUERY",
  "GRACC_TRUST_PROXY",
  "GRACC_RATE_LIMIT_MAX",
  "GRACC_RATE_LIMIT_WINDOW_MS",
  "GRACC_MAX_CONCURRENT_UPSTREAM",
  "GRACC_MAX_QUEUED_UPSTREAM",
  "GRACC_MAX_UPSTREAM_BYTES",
  "GRACC_CACHE_TTL_SECONDS",
  "GRACC_CACHE_MAX_BYTES"
] as const;

const originalEnv = Object.fromEntries(TRACKED_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of TRACKED_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("config loading", () => {
  it("strips wrapping quotes from string env vars", () => {
    process.env.GRACC_BASE_URL = "\"https://gracc.opensciencegrid.org/q\"";
    process.env.GRACC_DEFAULT_INDEX = "'gracc.osg.summary'";
    process.env.GRACC_ALLOWED_INDICES = "\"gracc.osg.summary, gracc.osg.summary2-oim\"";
    process.env.GRACC_HTTP_HOST = "'127.0.0.1'";

    const config = loadConfig();

    expect(config.baseUrl).toBe("https://gracc.opensciencegrid.org/q");
    expect(config.defaultIndex).toBe("gracc.osg.summary");
    expect(config.allowedIndices).toEqual(["gracc.osg.summary", "gracc.osg.summary2-oim"]);
    expect(config.httpHost).toBe("127.0.0.1");
  });

  it("uses conservative public-deployment defaults", () => {
    for (const key of TRACKED_KEYS) {
      delete process.env[key];
    }

    const config = loadConfig();

    expect(config.enableSafeQuery).toBe(true);
    expect(config.trustProxy).toBe(false);
    expect(config.rateLimit).toEqual({ windowMs: 60_000, max: 120 });
    expect(config.upstream).toEqual({
      maxConcurrent: 4,
      maxQueued: 32,
      maxResponseBytes: 1_048_576,
      cacheTtlSeconds: 300,
      cacheMaxBytes: 33_554_432
    });
  });

  it("parses public-deployment overrides", () => {
    process.env.GRACC_ENABLE_SAFE_QUERY = "false";
    process.env.GRACC_TRUST_PROXY = "1";
    process.env.GRACC_RATE_LIMIT_MAX = "0";
    process.env.GRACC_MAX_CONCURRENT_UPSTREAM = "3";
    process.env.GRACC_CACHE_TTL_SECONDS = "0";

    const config = loadConfig();

    expect(config.enableSafeQuery).toBe(false);
    expect(config.trustProxy).toBe(1);
    expect(config.rateLimit.max).toBe(0);
    expect(config.upstream.maxConcurrent).toBe(3);
    expect(config.upstream.cacheTtlSeconds).toBe(0);
  });
});
