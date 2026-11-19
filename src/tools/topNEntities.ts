import * as z from "zod/v4";

import { buildTopNQuery } from "../query/builders.js";
import { resolveDimension, resolveMetric } from "../schema/registry.js";
import {
  assertAllowedIndex,
  assertSupportedDateField,
  assertSupportedDimensionId,
  assertSupportedMetricIds,
  normalizeFilters,
  validateDateRange,
  validateTopN
} from "../validation/common.js";
import { filtersSchema, ToolContext } from "./shared.js";

export const topNEntitiesInputShape = {
  start: z.string().describe("Inclusive ISO-8601 start date or datetime."),
  end: z.string().describe("Exclusive ISO-8601 end date or datetime."),
  dimension: z
    .string()
    .describe(
      "Grouping dimension id or field name such as vo_name, project_name, site_name, resource_type, or common_name."
    ),
  metric: z
    .string()
    .optional()
    .describe("Ranking metric. Defaults to core_hours."),
  limit: z.number().int().optional().describe("Maximum bucket count. Defaults to 10."),
  filters: filtersSchema.optional(),
  date_field: z.enum(["end_time", "timestamp"]).optional(),
  index: z.string().optional()
};

export const topNEntitiesOutputShape = {
  index: z.string(),
  date_field: z.string(),
  dimension: z.object({
    id: z.string(),
    field: z.string(),
    label: z.string()
  }),
  metric: z.object({
    id: z.string(),
    field: z.string().optional(),
    label: z.string(),
    unit: z.string()
  }),
  start: z.string(),
  end: z.string(),
  limit: z.number(),
  filters: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      values: z.array(z.string())
    })
  ),
  buckets: z.array(
    z.object({
      key: z.string(),
      matched_documents: z.number(),
      metric_value: z.number()
    })
  )
};

export const topNEntitiesSchema = z.object(topNEntitiesInputShape);

export const topNEntities = async (
  args: z.infer<typeof topNEntitiesSchema>,
  context: ToolContext
) => {
  const index = assertAllowedIndex(context.config, args.index);
  const dateFieldId = assertSupportedDateField(args.date_field);
  const range = validateDateRange(args.start, args.end, context.config);
  const filters = normalizeFilters(args.filters ?? {}, context.config);
  const dimensionId = assertSupportedDimensionId(args.dimension);
  const metricId = assertSupportedMetricIds([args.metric ?? "core_hours"])[0];
  const limit = validateTopN(args.limit, context.config);

  const response = await context.client.search(index, buildTopNQuery({
    start: range.start,
    end: range.end,
    filters,
    dimensionId,
    metricId,
    limit,
    metricIds: [metricId],
    dateFieldId
  }));

  const dimension = resolveDimension(dimensionId);
  const metric = resolveMetric(metricId);

  if (!dimension || !metric) {
    throw new Error("Failed to resolve dimension or metric metadata.");
  }

  const buckets = (response.aggregations?.top_values?.buckets ?? []) as Array<{
    key: string;
    doc_count: number;
    metric_value?: { value?: number };
  }>;

  return {
    index,
    date_field: dateFieldId,
    dimension: {
      id: dimension.id,
      field: dimension.field,
      label: dimension.label
    },
    metric: {
      id: metric.id,
      field: metric.field,
      label: metric.label,
      unit: metric.unit
    },
    start: range.start,
    end: range.end,
    limit,
    filters,
    buckets: buckets.map((bucket) => ({
      key: String(bucket.key),
      matched_documents: bucket.doc_count,
      metric_value: typeof bucket.metric_value?.value === "number" ? bucket.metric_value.value : 0
    }))
  };
};
