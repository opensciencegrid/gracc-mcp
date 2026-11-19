import { OpenSearchSearchRequest, ServerConfig } from "../types.js";
import { DIMENSIONS, METRICS, resolveDimension, resolveMetric } from "../schema/registry.js";
import { isPlainObject } from "../utils/object.js";
import { estimateBucketCount, parseIsoInstant } from "../utils/time.js";
import { assertTimeZone } from "./common.js";

// run_safe_query never forwards the caller's JSON. Every accepted piece is
// rebuilt from scratch below, so keys this module does not know about can
// never reach GRACC.

type FieldKind = "date" | "keyword" | "metric";

interface ResolvedField {
  name: string;
  kind: FieldKind;
}

interface BoundedRange {
  start: Date;
  end: Date;
}

interface AggContext {
  config: ServerConfig;
  ranges: Map<string, BoundedRange>;
  count: number;
  buckets: number;
}

type Clause = Record<string, unknown>;

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "size",
  "from",
  "query",
  "aggs",
  "sort",
  "_source",
  "track_total_hits"
]);
const RANGE_OPERATORS = new Set(["gt", "gte", "lt", "lte"]);
const INTERVALS = new Set(["day", "week", "month"]);
const SORT_DIRECTIONS = new Set(["asc", "desc"]);
const AGG_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_AGG_DEPTH = 2;
const MAX_SORT_CLAUSES = 5;
const MAX_KEYWORD_LENGTH = 1024;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const NO_RANGE_MESSAGE =
  "run_safe_query requires a date range on EndTime or @timestamp with both a lower (gte/gt) and an upper (lt/lte) bound, as the top-level query or inside bool.filter.";

const DEFAULT_SOURCE_FIELDS = [
  ...new Set([
    ...DIMENSIONS.map((dimension) => dimension.field),
    ...METRICS.flatMap((metric) => (metric.field ? [metric.field] : []))
  ])
];

const resolveField = (raw: unknown, context: string): ResolvedField => {
  if (typeof raw !== "string") {
    throw new Error(`${context} must be a field name string.`);
  }

  const dimension = resolveDimension(raw);
  if (dimension) {
    return { name: dimension.field, kind: dimension.valueType === "date" ? "date" : "keyword" };
  }

  const metric = resolveMetric(raw);
  if (metric?.field) {
    return { name: metric.field, kind: "metric" };
  }

  throw new Error(`Field "${raw}" is not allowlisted for run_safe_query.`);
};

const assertOnlyKeys = (value: Record<string, unknown>, allowed: string[], context: string) => {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(
        `Unsupported key "${key}" in ${context}. Allowed keys: ${allowed.join(", ")}.`
      );
    }
  }
};

const singleEntry = (value: unknown, context: string): [string, unknown] => {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) {
    throw new Error(`${context} must be an object with exactly one key.`);
  }

  return Object.entries(value)[0];
};

const integerInRange = (value: unknown, min: number, max: number, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }

  return value;
};

const scalarFor = (field: ResolvedField, value: unknown, context: string): string | number | boolean => {
  switch (field.kind) {
    case "date":
      if (typeof value !== "string") {
        throw new Error(`${context} must be an ISO 8601 date string.`);
      }
      return parseIsoInstant(value, context).toISOString();
    case "metric":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${context} must be a number.`);
      }
      return value;
    case "keyword":
      if (typeof value === "string") {
        if (value.length > MAX_KEYWORD_LENGTH) {
          throw new Error(`${context} must be at most ${MAX_KEYWORD_LENGTH} characters.`);
        }
        return value;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return value;
      }
      throw new Error(`${context} values must be strings, numbers, or booleans.`);
  }
};

// ---------------------------------------------------------------------------
// Query clauses
// ---------------------------------------------------------------------------

interface QueryContext {
  config: ServerConfig;
  clauses: number;
}

const buildQuery = (query: unknown, boolDepth: number, ctx: QueryContext): Clause => {
  ctx.clauses += 1;
  if (ctx.clauses > ctx.config.safety.maxQueryClauses) {
    throw new Error(
      `run_safe_query allows at most ${ctx.config.safety.maxQueryClauses} query clauses.`
    );
  }

  const [operator, body] = singleEntry(query, "Each query clause");

  switch (operator) {
    case "bool":
      return { bool: buildBool(body, boolDepth + 1, ctx) };
    case "term": {
      const [rawField, value] = singleEntry(body, `"term"`);
      const field = resolveField(rawField, `"term" field`);
      return { term: { [field.name]: scalarFor(field, value, `"term" value for ${field.name}`) } };
    }
    case "terms": {
      const [rawField, values] = singleEntry(body, `"terms"`);
      const field = resolveField(rawField, `"terms" field`);
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`"terms" values for ${field.name} must be a non-empty array.`);
      }
      if (values.length > ctx.config.safety.maxFilterValues) {
        throw new Error(
          `"terms" on ${field.name} accepts at most ${ctx.config.safety.maxFilterValues} values.`
        );
      }
      return {
        terms: {
          [field.name]: values.map((value) => scalarFor(field, value, `"terms" ${field.name}`))
        }
      };
    }
    case "range": {
      const [rawField, bounds] = singleEntry(body, `"range"`);
      const field = resolveField(rawField, `"range" field`);
      if (!isPlainObject(bounds) || Object.keys(bounds).length === 0) {
        throw new Error(`"range" on ${field.name} must be an object of gt/gte/lt/lte bounds.`);
      }
      const built: Record<string, string | number | boolean> = {};
      for (const [operatorName, value] of Object.entries(bounds)) {
        if (!RANGE_OPERATORS.has(operatorName)) {
          throw new Error(`Unsupported range operator "${operatorName}". Allowed: gt, gte, lt, lte.`);
        }
        built[operatorName] = scalarFor(field, value, `Range value ${field.name}.${operatorName}`);
      }
      return { range: { [field.name]: built } };
    }
    default:
      throw new Error(
        `Unsupported query operator "${operator}" in run_safe_query. Allowed: bool, term, terms, range.`
      );
  }
};

const buildBool = (body: unknown, depth: number, ctx: QueryContext): Clause => {
  if (depth > ctx.config.safety.maxBoolDepth) {
    throw new Error(
      `bool nesting is limited to ${ctx.config.safety.maxBoolDepth} levels in run_safe_query.`
    );
  }

  if (!isPlainObject(body)) {
    throw new Error(`"bool" query body must be an object.`);
  }

  assertOnlyKeys(body, ["filter", "must_not"], "bool");

  const built: Clause = {};
  for (const key of ["filter", "must_not"] as const) {
    const items = body[key];
    if (items === undefined) {
      continue;
    }
    if (!Array.isArray(items)) {
      throw new Error(`bool.${key} must be an array.`);
    }
    built[key] = items.map((item) => buildQuery(item, depth, ctx));
  }

  if (Object.keys(built).length === 0) {
    throw new Error(`"bool" must include filter or must_not.`);
  }

  return built;
};

/** Bounded date ranges that constrain the whole query, keyed by field. */
const collectBoundedDateRanges = (query: Clause, config: ServerConfig): Map<string, BoundedRange> => {
  const candidates: Clause[] =
    "range" in query
      ? [query]
      : "bool" in query
        ? (((query.bool as Clause).filter as Clause[] | undefined) ?? [])
        : [];

  const ranges = new Map<string, BoundedRange>();

  for (const clause of candidates) {
    if (!("range" in clause)) {
      continue;
    }

    const [field, bounds] = Object.entries(clause.range as Record<string, Record<string, unknown>>)[0];
    if (field !== "EndTime" && field !== "@timestamp") {
      continue;
    }

    const lower = bounds.gte ?? bounds.gt;
    const upper = bounds.lt ?? bounds.lte;
    if (typeof lower !== "string" || typeof upper !== "string") {
      continue;
    }

    const start = new Date(lower);
    const end = new Date(upper);
    if (end <= start) {
      throw new Error(`The upper bound of the ${field} range must be later than the lower bound.`);
    }

    const days = (end.getTime() - start.getTime()) / MS_PER_DAY;
    if (days > config.safety.maxRangeDays) {
      throw new Error(
        `Date range on ${field} exceeds the maximum of ${config.safety.maxRangeDays} days. Requested: ${days.toFixed(1)} days.`
      );
    }

    const existing = ranges.get(field);
    if (!existing || end.getTime() - start.getTime() < existing.end.getTime() - existing.start.getTime()) {
      ranges.set(field, { start, end });
    }
  }

  if (ranges.size === 0) {
    throw new Error(NO_RANGE_MESSAGE);
  }

  return ranges;
};

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

const addBuckets = (ctx: AggContext, buckets: number) => {
  ctx.buckets += buckets;
  if (ctx.buckets > ctx.config.safety.maxSafeQueryBuckets) {
    throw new Error(
      `This aggregation tree could produce about ${ctx.buckets} buckets, above the limit of ${ctx.config.safety.maxSafeQueryBuckets}. Reduce terms sizes, use a coarser interval, or narrow the date range.`
    );
  }
};

const buildTermsOrder = (order: unknown, childAggs: unknown, name: string): Record<string, string> => {
  const [key, direction] = singleEntry(order, `"terms.order" in "${name}"`);

  if (typeof direction !== "string" || !SORT_DIRECTIONS.has(direction)) {
    throw new Error(`"terms.order" direction in "${name}" must be "asc" or "desc".`);
  }

  if (key !== "_count" && key !== "_key") {
    const child = isPlainObject(childAggs) ? childAggs[key] : undefined;
    const isMetricChild = isPlainObject(child) && ("sum" in child || "value_count" in child);
    if (!isMetricChild) {
      throw new Error(
        `"terms.order" key "${key}" in "${name}" must be _count, _key, or the name of a sum/value_count sub-aggregation.`
      );
    }
  }

  return { [key]: direction };
};

const buildAgg = (
  agg: unknown,
  name: string,
  depth: number,
  parentBuckets: number,
  ctx: AggContext
): Clause => {
  if (!isPlainObject(agg)) {
    throw new Error(`Aggregation "${name}" must be an object.`);
  }

  const operators = Object.keys(agg).filter((key) => key !== "aggs");
  if (operators.length !== 1) {
    throw new Error(
      `Aggregation "${name}" must define exactly one of terms, date_histogram, sum, value_count.`
    );
  }

  const operator = operators[0];
  const body = agg[operator];
  if (!isPlainObject(body)) {
    throw new Error(`Aggregation "${name}" ${operator} body must be an object.`);
  }

  switch (operator) {
    case "sum":
    case "value_count": {
      assertOnlyKeys(body, ["field"], `${operator} aggregation "${name}"`);
      const field = resolveField(body.field, `${operator} field in "${name}"`);
      if (operator === "sum" && field.kind !== "metric") {
        throw new Error(
          `sum aggregation "${name}" requires a metric field such as CoreHours or Njobs; got ${field.name}.`
        );
      }
      if (agg.aggs !== undefined) {
        throw new Error(`Metric aggregation "${name}" cannot have sub-aggregations.`);
      }
      return { [operator]: { field: field.name } };
    }

    case "terms": {
      assertOnlyKeys(body, ["field", "size", "order"], `terms aggregation "${name}"`);
      const field = resolveField(body.field, `terms field in "${name}"`);
      if (field.kind !== "keyword") {
        throw new Error(
          `terms aggregation "${name}" requires a grouping dimension such as VOName or ProjectName; got ${field.name}.`
        );
      }
      const size = integerInRange(body.size ?? 10, 1, ctx.config.safety.maxTopN, `"terms.size" in "${name}"`);
      const terms: Clause = { field: field.name, size };
      if (body.order !== undefined) {
        terms.order = buildTermsOrder(body.order, agg.aggs, name);
      }

      const buckets = parentBuckets * size;
      addBuckets(ctx, buckets);

      const built: Clause = { terms };
      if (agg.aggs !== undefined) {
        built.aggs = buildAggs(agg.aggs, depth + 1, buckets, ctx);
      }
      return built;
    }

    case "date_histogram": {
      assertOnlyKeys(body, ["field", "calendar_interval", "time_zone"], `date_histogram aggregation "${name}"`);
      const field = resolveField(body.field, `date_histogram field in "${name}"`);
      if (field.kind !== "date") {
        throw new Error(
          `date_histogram aggregation "${name}" requires a date field (EndTime or @timestamp); got ${field.name}.`
        );
      }

      const interval = body.calendar_interval;
      if (typeof interval !== "string" || !INTERVALS.has(interval)) {
        throw new Error(`"calendar_interval" in "${name}" must be day, week, or month.`);
      }

      const range = ctx.ranges.get(field.name);
      if (!range) {
        throw new Error(
          `date_histogram on ${field.name} in "${name}" requires a bounded range on ${field.name} in the query.`
        );
      }

      const histogram: Clause = { field: field.name, calendar_interval: interval };
      if (body.time_zone !== undefined) {
        if (typeof body.time_zone !== "string") {
          throw new Error(`"time_zone" in "${name}" must be a string.`);
        }
        histogram.time_zone = assertTimeZone(body.time_zone);
      }

      const ownBuckets =
        estimateBucketCount(
          { start: range.start.toISOString(), end: range.end.toISOString() },
          interval as "day" | "week" | "month"
        ) + 1;
      const buckets = parentBuckets * ownBuckets;
      addBuckets(ctx, buckets);

      const built: Clause = { date_histogram: histogram };
      if (agg.aggs !== undefined) {
        built.aggs = buildAggs(agg.aggs, depth + 1, buckets, ctx);
      }
      return built;
    }

    default:
      throw new Error(
        `Unsupported aggregation "${operator}" in "${name}". Allowed: terms, date_histogram, sum, value_count.`
      );
  }
};

const buildAggs = (aggs: unknown, depth: number, parentBuckets: number, ctx: AggContext): Clause => {
  if (depth > MAX_AGG_DEPTH) {
    throw new Error(`run_safe_query supports aggregation nesting up to depth ${MAX_AGG_DEPTH}.`);
  }

  if (!isPlainObject(aggs) || Object.keys(aggs).length === 0) {
    throw new Error(`"aggs" must be a non-empty object of named aggregations.`);
  }

  const built: Clause = {};
  for (const [name, agg] of Object.entries(aggs)) {
    if (!AGG_NAME.test(name)) {
      throw new Error(
        `Aggregation name "${name}" may only use letters, digits, "_" and "-" (max 64 characters).`
      );
    }

    ctx.count += 1;
    if (ctx.count > ctx.config.safety.maxSafeQueryAggs) {
      throw new Error(
        `run_safe_query allows at most ${ctx.config.safety.maxSafeQueryAggs} aggregations.`
      );
    }

    built[name] = buildAgg(agg, name, depth, parentBuckets, ctx);
  }

  return built;
};

// ---------------------------------------------------------------------------
// Sort and _source
// ---------------------------------------------------------------------------

const buildSort = (sort: unknown): Array<Record<string, string>> => {
  if (!Array.isArray(sort) || sort.length > MAX_SORT_CLAUSES) {
    throw new Error(`"sort" must be an array of at most ${MAX_SORT_CLAUSES} clauses.`);
  }

  return sort.map((item) => {
    const [rawField, direction] = singleEntry(item, "Each sort clause");
    const field = resolveField(rawField, "Sort field");
    if (typeof direction !== "string" || !SORT_DIRECTIONS.has(direction)) {
      throw new Error(`Sort direction for "${rawField}" must be "asc" or "desc".`);
    }
    return { [field.name]: direction };
  });
};

const buildSource = (source: unknown, size: number, config: ServerConfig): false | string[] => {
  if (source === undefined) {
    return size > 0 ? [...DEFAULT_SOURCE_FIELDS] : false;
  }

  if (source === false) {
    return false;
  }

  if (!Array.isArray(source)) {
    throw new Error(`"_source" must be false or an array of allowlisted field names.`);
  }

  if (source.length > config.safety.maxSourceFields) {
    throw new Error(`"_source" may include at most ${config.safety.maxSourceFields} fields.`);
  }

  return [...new Set(source.map((field) => resolveField(field, `"_source" entry`).name))];
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Validate a run_safe_query body and return a freshly built, allowlisted copy. */
export const buildSafeQueryBody = (body: unknown, config: ServerConfig): OpenSearchSearchRequest => {
  if (!isPlainObject(body)) {
    throw new Error(`run_safe_query.body must be a JSON object.`);
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`Top-level key "${key}" is not supported in run_safe_query.`);
    }
  }

  const size = integerInRange(body.size ?? 0, 0, config.safety.maxSafeQuerySize, "size");
  const built: OpenSearchSearchRequest = { size };

  if (body.from !== undefined) {
    built.from = integerInRange(body.from, 0, config.safety.maxSafeQueryFrom, "from");
  }

  if (body.track_total_hits !== undefined) {
    if (typeof body.track_total_hits !== "boolean") {
      throw new Error(`track_total_hits must be a boolean.`);
    }
    built.track_total_hits = body.track_total_hits;
  }

  if (body.query === undefined) {
    throw new Error(NO_RANGE_MESSAGE);
  }

  const query = buildQuery(body.query, 0, { config, clauses: 0 });
  const ranges = collectBoundedDateRanges(query, config);
  built.query = query;

  if (body.aggs !== undefined) {
    built.aggs = buildAggs(body.aggs, 1, 1, { config, ranges, count: 0, buckets: 0 });
  }

  if (body.sort !== undefined) {
    built.sort = buildSort(body.sort);
  }

  built._source = buildSource(body._source, size, config);

  return built;
};

export const validateSafeQueryBody = (body: unknown, config: ServerConfig): void => {
  buildSafeQueryBody(body, config);
};
