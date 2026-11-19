import * as z from "zod/v4";

import { buildTimeSeriesQuery } from "../query/builders.js";
import { resolveMetric } from "../schema/registry.js";
import {
  assertAllowedIndex,
  assertSupportedDateField,
  assertSupportedMetricIds,
  normalizeFilters,
  validateDateRange,
  validateTimeSeriesInterval
} from "../validation/common.js";
import { filtersSchema, ToolContext } from "./shared.js";

export const timeSeriesUsageInputShape = {
  start: z.string().describe("Inclusive ISO-8601 start date or datetime."),
  end: z.string().describe("Exclusive ISO-8601 end date or datetime."),
  metric: z
    .string()
    .optional()
    .describe("Series metric. Defaults to core_hours."),
  interval: z
    .enum(["day", "week", "month"])
    .describe("Date histogram interval."),
  filters: filtersSchema.optional(),
  date_field: z.enum(["end_time", "timestamp"]).optional(),
  time_zone: z
    .string()
    .optional()
    .describe("IANA or OpenSearch-compatible time zone for bucketing. Defaults to UTC."),
  index: z.string().optional()
};

export const timeSeriesUsageOutputShape = {
  index: z.string(),
  date_field: z.string(),
  interval: z.string(),
  time_zone: z.string(),
  metric: z.object({
    id: z.string(),
    field: z.string().optional(),
    label: z.string(),
    unit: z.string()
  }),
  start: z.string(),
  end: z.string(),
  filters: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      values: z.array(z.string())
    })
  ),
  buckets: z.array(
    z.object({
      start: z.string(),
      matched_documents: z.number(),
      metric_value: z.number()
    })
  ),
  total_metric_value: z.number()
};

export const timeSeriesUsageSchema = z.object(timeSeriesUsageInputShape);

export const timeSeriesUsage = async (
  args: z.infer<typeof timeSeriesUsageSchema>,
  context: ToolContext
) => {
  const index = assertAllowedIndex(context.config, args.index);
  const dateFieldId = assertSupportedDateField(args.date_field);
  const range = validateDateRange(args.start, args.end, context.config);
  const filters = normalizeFilters(args.filters ?? {}, context.config);
  const metricId = assertSupportedMetricIds([args.metric ?? "core_hours"])[0];
  validateTimeSeriesInterval(range.start, range.end, args.interval, context.config);
  const timeZone = args.time_zone ?? "UTC";

  const response = await context.client.search(index, buildTimeSeriesQuery({
    start: range.start,
    end: range.end,
    filters,
    metricId,
    metricIds: [metricId],
    interval: args.interval,
    timeZone,
    dateFieldId
  }));

  const metric = resolveMetric(metricId);
  if (!metric) {
    throw new Error(`Unsupported metric "${metricId}".`);
  }

  const buckets = (response.aggregations?.series?.buckets ?? []) as Array<{
    key_as_string: string;
    doc_count: number;
    metric_value?: { value?: number };
  }>;

  const normalizedBuckets = buckets.map((bucket) => ({
    start: bucket.key_as_string,
    matched_documents: bucket.doc_count,
    metric_value: typeof bucket.metric_value?.value === "number" ? bucket.metric_value.value : 0
  }));

  return {
    index,
    date_field: dateFieldId,
    interval: args.interval,
    time_zone: timeZone,
    metric: {
      id: metric.id,
      field: metric.field,
      label: metric.label,
      unit: metric.unit
    },
    start: range.start,
    end: range.end,
    filters,
    buckets: normalizedBuckets,
    total_metric_value: normalizedBuckets.reduce((sum, bucket) => sum + bucket.metric_value, 0)
  };
};
