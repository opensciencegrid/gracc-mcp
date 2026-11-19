export interface JsonObject {
  [key: string]: unknown;
}

export interface FilterSpec {
  id: string;
  field: string;
  values: string[];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface NormalizedDateRange extends DateRange {
  startDate: Date;
  endDate: Date;
}

export interface OpenSearchSearchRequest {
  track_total_hits?: boolean;
  size?: number;
  from?: number;
  sort?: unknown;
  _source?: boolean | string[];
  query?: Record<string, unknown>;
  aggs?: Record<string, unknown>;
}

export interface OpenSearchSearchResponse<TSource = JsonObject> {
  took: number;
  timed_out: boolean;
  hits: {
    total?: {
      value: number;
      relation: "eq" | "gte";
    };
    hits: Array<{
      _id?: string;
      _index?: string;
      _score?: number | null;
      _source?: TSource;
    }>;
  };
  aggregations?: Record<string, any>;
}

export interface DimensionDefinition {
  id: string;
  field: string;
  label: string;
  description: string;
  category: "time" | "identity" | "resource" | "organization";
  valueType: "keyword" | "date";
  aliases: string[];
  filterable: boolean;
  groupable: boolean;
  exampleValues?: string[];
  notes?: string[];
}

export interface MetricDefinition {
  id: string;
  field?: string;
  label: string;
  description: string;
  unit: string;
  aggregation: "sum" | "value_count" | "doc_count";
  aliases: string[];
  notes?: string[];
}

export interface SafetyLimits {
  maxRangeDays: number;
  maxBuckets: number;
  maxTopN: number;
  maxFilterValues: number;
  maxSafeQuerySize: number;
  maxSafeQueryFrom: number;
  maxSourceFields: number;
  maxSafeQueryAggs: number;
  maxSafeQueryBuckets: number;
  maxBoolDepth: number;
  maxQueryClauses: number;
  maxResultBytes: number;
  requestTimeoutMs: number;
  retryCount: number;
}

export interface UpstreamLimits {
  maxConcurrent: number;
  maxQueued: number;
  maxResponseBytes: number;
  cacheTtlSeconds: number;
  cacheMaxBytes: number;
}

export interface RateLimitConfig {
  windowMs: number;
  /** Requests per client IP per window. 0 disables rate limiting. */
  max: number;
}

export interface ServerConfig {
  baseUrl: string;
  defaultIndex: string;
  allowedIndices: string[];
  httpHost: string;
  httpPort: number;
  enableSafeQuery: boolean;
  /** Passed to Express "trust proxy": false, true, a hop count, or a subnet list. */
  trustProxy: boolean | number | string;
  rateLimit: RateLimitConfig;
  upstream: UpstreamLimits;
  safety: SafetyLimits;
}

export interface SourceNote {
  label: string;
  url: string;
  detail: string;
}
