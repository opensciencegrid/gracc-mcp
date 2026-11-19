import { ServerConfig } from "../types.js";
import { resolveDimension, resolveMetric, SUPPORTED_DATE_FIELDS } from "../schema/registry.js";
import { isPlainObject } from "../utils/object.js";

const allowedTopLevelKeys = new Set([
  "size",
  "from",
  "query",
  "aggs",
  "sort",
  "_source",
  "track_total_hits"
]);

const allowedRangeOperators = new Set(["gt", "gte", "lt", "lte"]);
const allowedIntervals = new Set(["day", "week", "month"]);
const allowedSortDirections = new Set(["asc", "desc"]);

const resolveFieldName = (field: string): string => {
  return resolveDimension(field)?.field ?? resolveMetric(field)?.field ?? field;
};

const assertAllowedField = (field: string): string => {
  const normalized = resolveFieldName(field);
  const dimension = resolveDimension(normalized);
  const metric = resolveMetric(normalized);
  const dateFieldAllowed = Object.values(SUPPORTED_DATE_FIELDS).includes(
    normalized as (typeof SUPPORTED_DATE_FIELDS)[keyof typeof SUPPORTED_DATE_FIELDS]
  );

  if (!dimension && !metric && !dateFieldAllowed) {
    throw new Error(`Field "${field}" is not allowlisted for run_safe_query.`);
  }

  return normalized;
};

const assertAllowedSource = (source: unknown, config: ServerConfig): void => {
  if (source === false) {
    return;
  }

  if (!Array.isArray(source)) {
    throw new Error(`"_source" must be false or an array of allowlisted field names.`);
  }

  if (source.length > config.safety.maxSourceFields) {
    throw new Error(
      `"_source" may include at most ${config.safety.maxSourceFields} fields.`
    );
  }

  for (const field of source) {
    if (typeof field !== "string") {
      throw new Error(`"_source" entries must be strings.`);
    }

    assertAllowedField(field);
  }
};

const assertAllowedSort = (sort: unknown): void => {
  if (!Array.isArray(sort)) {
    throw new Error(`"sort" must be an array.`);
  }

  for (const item of sort) {
    if (!isPlainObject(item) || Object.keys(item).length !== 1) {
      throw new Error(`Each sort clause must be an object with exactly one field.`);
    }

    const [field, direction] = Object.entries(item)[0];
    assertAllowedField(field);

    if (typeof direction !== "string" || !allowedSortDirections.has(direction)) {
      throw new Error(`Sort direction for "${field}" must be "asc" or "desc".`);
    }
  }
};

const assertLeafQuery = (query: unknown): void => {
  if (!isPlainObject(query) || Object.keys(query).length !== 1) {
    throw new Error(`Each query clause must be an object with exactly one operator.`);
  }

  const [operator, body] = Object.entries(query)[0];

  if (operator === "bool") {
    if (!isPlainObject(body)) {
      throw new Error(`"bool" query body must be an object.`);
    }

    const allowedKeys = new Set(["filter", "must_not"]);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        throw new Error(`Unsupported bool key "${key}" in run_safe_query.`);
      }
    }

    const nested = body.filter ?? body.must_not;
    if (nested !== undefined && !Array.isArray(nested)) {
      throw new Error(`bool.filter and bool.must_not must be arrays.`);
    }

    for (const key of ["filter", "must_not"] as const) {
      const items = body[key];
      if (items === undefined) {
        continue;
      }

      for (const entry of items as unknown[]) {
        assertLeafQuery(entry);
      }
    }

    return;
  }

  if (operator === "term") {
    if (!isPlainObject(body) || Object.keys(body).length !== 1) {
      throw new Error(`"term" must target exactly one field.`);
    }

    const [field, value] = Object.entries(body)[0];
    assertAllowedField(field);
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`"term" values must be string, number, or boolean.`);
    }
    return;
  }

  if (operator === "terms") {
    if (!isPlainObject(body) || Object.keys(body).length !== 1) {
      throw new Error(`"terms" must target exactly one field.`);
    }

    const [field, value] = Object.entries(body)[0];
    assertAllowedField(field);
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`"terms" values must be a non-empty array.`);
    }
    return;
  }

  if (operator === "range") {
    if (!isPlainObject(body) || Object.keys(body).length !== 1) {
      throw new Error(`"range" must target exactly one field.`);
    }

    const [field, range] = Object.entries(body)[0];
    assertAllowedField(field);
    if (!isPlainObject(range)) {
      throw new Error(`"range" body for "${field}" must be an object.`);
    }

    for (const [rangeOperator, value] of Object.entries(range)) {
      if (!allowedRangeOperators.has(rangeOperator)) {
        throw new Error(`Unsupported range operator "${rangeOperator}".`);
      }

      if (typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Range values must be strings or numbers.`);
      }
    }
    return;
  }

  throw new Error(`Unsupported query operator "${operator}" in run_safe_query.`);
};

const assertAgg = (agg: unknown, depth: number, config: ServerConfig): void => {
  if (!isPlainObject(agg)) {
    throw new Error(`Aggregation definitions must be objects.`);
  }

  if (depth > 2) {
    throw new Error(`run_safe_query supports aggregation nesting up to depth 2.`);
  }

  const allowedKeys = new Set(["terms", "sum", "value_count", "date_histogram", "aggs"]);
  for (const key of Object.keys(agg)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported aggregation key "${key}".`);
    }
  }

  const operators = ["terms", "sum", "value_count", "date_histogram"].filter(
    (key) => key in agg
  );

  if (operators.length !== 1) {
    throw new Error(`Each aggregation must define exactly one aggregation operator.`);
  }

  const operator = operators[0] as "terms" | "sum" | "value_count" | "date_histogram";
  const body = agg[operator];
  if (!isPlainObject(body)) {
    throw new Error(`Aggregation operator "${operator}" must have an object body.`);
  }

  switch (operator) {
    case "sum":
    case "value_count": {
      const field = body.field;
      if (typeof field !== "string") {
        throw new Error(`"${operator}" requires a string field.`);
      }
      assertAllowedField(field);
      break;
    }
    case "terms": {
      const field = body.field;
      const size = body.size;
      if (typeof field !== "string") {
        throw new Error(`"terms" requires a string field.`);
      }
      assertAllowedField(field);
      if (
        size !== undefined &&
        (typeof size !== "number" ||
          !Number.isInteger(size) ||
          size < 1 ||
          size > config.safety.maxTopN)
      ) {
        throw new Error(`"terms.size" must be between 1 and ${config.safety.maxTopN}.`);
      }
      if (body.order !== undefined) {
        if (!isPlainObject(body.order) || Object.keys(body.order).length !== 1) {
          throw new Error(`"terms.order" must be an object with one key.`);
        }
        const direction = Object.values(body.order)[0];
        if (typeof direction !== "string" || !allowedSortDirections.has(direction)) {
          throw new Error(`"terms.order" direction must be "asc" or "desc".`);
        }
      }
      break;
    }
    case "date_histogram": {
      const field = body.field;
      const interval = body.calendar_interval;
      if (typeof field !== "string") {
        throw new Error(`"date_histogram" requires a string field.`);
      }
      assertAllowedField(field);
      if (typeof interval !== "string" || !allowedIntervals.has(interval)) {
        throw new Error(`"date_histogram.calendar_interval" must be day, week, or month.`);
      }
      break;
    }
  }

  if (agg.aggs !== undefined) {
    if (!isPlainObject(agg.aggs)) {
      throw new Error(`Nested "aggs" must be an object.`);
    }

    for (const nestedAgg of Object.values(agg.aggs)) {
      assertAgg(nestedAgg, depth + 1, config);
    }
  }
};

export const validateSafeQueryBody = (body: unknown, config: ServerConfig): void => {
  if (!isPlainObject(body)) {
    throw new Error(`run_safe_query.body must be a JSON object.`);
  }

  for (const key of Object.keys(body)) {
    if (!allowedTopLevelKeys.has(key)) {
      throw new Error(`Top-level key "${key}" is not supported in run_safe_query.`);
    }
  }

  if (body.size !== undefined) {
    const size = body.size;
    if (
      typeof size !== "number" ||
      !Number.isInteger(size) ||
      size < 0 ||
      size > config.safety.maxSafeQuerySize
    ) {
      throw new Error(`size must be between 0 and ${config.safety.maxSafeQuerySize}.`);
    }
  }

  if (body.from !== undefined) {
    const from = body.from;
    if (
      typeof from !== "number" ||
      !Number.isInteger(from) ||
      from < 0 ||
      from > config.safety.maxSafeQueryFrom
    ) {
      throw new Error(`from must be between 0 and ${config.safety.maxSafeQueryFrom}.`);
    }
  }

  if (body._source !== undefined) {
    assertAllowedSource(body._source, config);
  }

  if (body.sort !== undefined) {
    assertAllowedSort(body.sort);
  }

  if (body.query !== undefined) {
    assertLeafQuery(body.query);
  }

  if (body.aggs !== undefined) {
    if (!isPlainObject(body.aggs)) {
      throw new Error(`aggs must be an object.`);
    }

    for (const agg of Object.values(body.aggs)) {
      assertAgg(agg, 1, config);
    }
  }

  if (body.track_total_hits !== undefined && typeof body.track_total_hits !== "boolean") {
    throw new Error(`track_total_hits must be a boolean.`);
  }
};
