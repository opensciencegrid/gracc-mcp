import "dotenv/config";

import { ServerConfig } from "../types.js";

const normalizeString = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  const hasDoubleQuotes = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const asInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asCsv = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback;
  }

  return normalizeString(value, fallback.join(","))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = normalizeString(value, "").toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const asTrustProxy = (value: string | undefined): boolean | number | string => {
  const normalized = normalizeString(value, "");
  if (!normalized || normalized.toLowerCase() === "false") {
    return false;
  }

  if (normalized.toLowerCase() === "true") {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  return normalized;
};

export const loadConfig = (): ServerConfig => {
  return {
    baseUrl: normalizeString(
      process.env.GRACC_BASE_URL,
      "https://gracc.opensciencegrid.org/q"
    ),
    defaultIndex: normalizeString(process.env.GRACC_DEFAULT_INDEX, "gracc.osg.summary"),
    allowedIndices: asCsv(process.env.GRACC_ALLOWED_INDICES, ["gracc.osg.summary"]),
    httpHost: normalizeString(process.env.GRACC_HTTP_HOST, "127.0.0.1"),
    httpPort: asInt(process.env.GRACC_HTTP_PORT, 3333),
    enableSafeQuery: asBool(process.env.GRACC_ENABLE_SAFE_QUERY, true),
    trustProxy: asTrustProxy(process.env.GRACC_TRUST_PROXY),
    rateLimit: {
      windowMs: asInt(process.env.GRACC_RATE_LIMIT_WINDOW_MS, 60_000),
      max: asInt(process.env.GRACC_RATE_LIMIT_MAX, 120)
    },
    upstream: {
      maxConcurrent: asInt(process.env.GRACC_MAX_CONCURRENT_UPSTREAM, 4),
      maxQueued: asInt(process.env.GRACC_MAX_QUEUED_UPSTREAM, 32),
      maxResponseBytes: asInt(process.env.GRACC_MAX_UPSTREAM_BYTES, 1_048_576),
      cacheTtlSeconds: asInt(process.env.GRACC_CACHE_TTL_SECONDS, 300),
      cacheMaxBytes: asInt(process.env.GRACC_CACHE_MAX_BYTES, 33_554_432)
    },
    safety: {
      maxRangeDays: asInt(process.env.GRACC_MAX_RANGE_DAYS, 366),
      maxBuckets: asInt(process.env.GRACC_MAX_BUCKETS, 366),
      maxTopN: asInt(process.env.GRACC_MAX_TOP_N, 25),
      maxFilterValues: 25,
      maxSafeQuerySize: asInt(process.env.GRACC_MAX_SAFE_QUERY_SIZE, 25),
      maxSafeQueryFrom: 100,
      maxSourceFields: 20,
      maxSafeQueryAggs: 10,
      maxSafeQueryBuckets: 10_000,
      maxBoolDepth: 3,
      maxQueryClauses: 32,
      maxResultBytes: asInt(process.env.GRACC_MAX_RESULT_BYTES, 262144),
      requestTimeoutMs: asInt(process.env.GRACC_TIMEOUT_MS, 30000),
      retryCount: asInt(process.env.GRACC_RETRY_COUNT, 2)
    }
  };
};
