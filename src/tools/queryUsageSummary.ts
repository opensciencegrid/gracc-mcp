import * as z from "zod/v4";

import { buildSummaryQuery } from "../query/builders.js";
import { assertAllowedIndex, assertSupportedDateField, assertSupportedMetricIds, normalizeFilters, validateDateRange } from "../validation/common.js";
import { toMetricOutput, defaultSummaryMetricIds, filtersSchema, ToolContext } from "./shared.js";

export const queryUsageSummaryInputShape = {
  start: z.string().describe("Inclusive ISO-8601 start date or datetime."),
  end: z.string().describe("Exclusive ISO-8601 end date or datetime."),
  metrics: z
    .array(z.string())
    .max(8)
    .optional()
    .describe(
      "Metric ids such as job_count, core_hours, wall_duration_seconds, cpu_duration_seconds, or processor_count_sum."
    ),
  filters: filtersSchema.describe(
    "Exact-match filters keyed by supported dimension id or field name. Example: {\"vo_name\":\"ligo\",\"resource_type\":\"Payload\"}"
  ),
  date_field: z
    .enum(["end_time", "timestamp"])
    .optional()
    .describe("Date field to filter on. Defaults to end_time."),
  index: z.string().optional().describe("Optional allowlisted index. Defaults to gracc.osg.summary.")
};

export const queryUsageSummaryOutputShape = {
  index: z.string(),
  date_field: z.string(),
  start: z.string(),
  end: z.string(),
  matched_documents: z.number(),
  filters: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      values: z.array(z.string())
    })
  ),
  metrics: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      unit: z.string(),
      value: z.number()
    })
  )
};

export const queryUsageSummarySchema = z.object(queryUsageSummaryInputShape);

export const queryUsageSummary = async (
  args: z.infer<typeof queryUsageSummarySchema>,
  context: ToolContext
) => {
  const index = assertAllowedIndex(context.config, args.index);
  const dateFieldId = assertSupportedDateField(args.date_field);
  const range = validateDateRange(args.start, args.end, context.config);
  const filters = normalizeFilters(args.filters ?? {}, context.config);
  const metricIds = assertSupportedMetricIds(args.metrics ?? defaultSummaryMetricIds);

  const response = await context.client.search(index, buildSummaryQuery({
    start: range.start,
    end: range.end,
    filters,
    metricIds,
    dateFieldId
  }));

  return {
    index,
    date_field: dateFieldId,
    start: range.start,
    end: range.end,
    matched_documents: response.hits.total?.value ?? 0,
    filters,
    metrics: metricIds.map((metricId) =>
      toMetricOutput(metricId, response.aggregations?.[metricId]?.value)
    )
  };
};
