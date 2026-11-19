import * as z from "zod/v4";

import { DIMENSIONS, METRICS, SUPPORTED_DATE_FIELDS } from "../schema/registry.js";
import { ToolContext } from "./shared.js";

export const listDimensionsInputShape = {
  include_examples: z
    .boolean()
    .optional()
    .describe("Include example values when available. Defaults to true.")
};

export const listDimensionsOutputShape = {
  default_index: z.string(),
  allowed_indices: z.array(z.string()),
  default_date_field: z.string(),
  date_fields: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      label: z.string(),
      description: z.string()
    })
  ),
  dimensions: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      label: z.string(),
      description: z.string(),
      category: z.string(),
      value_type: z.string(),
      filterable: z.boolean(),
      groupable: z.boolean(),
      aliases: z.array(z.string()),
      example_values: z.array(z.string()).optional(),
      notes: z.array(z.string()).optional()
    })
  ),
  metrics: z.array(
    z.object({
      id: z.string(),
      field: z.string().optional(),
      label: z.string(),
      description: z.string(),
      aggregation: z.string(),
      unit: z.string(),
      aliases: z.array(z.string()),
      notes: z.array(z.string()).optional()
    })
  )
};

export const listDimensionsSchema = z.object(listDimensionsInputShape);

export const listDimensions = async (
  args: z.infer<typeof listDimensionsSchema>,
  context: ToolContext
) => {
  const includeExamples = args.include_examples ?? true;

  return {
    default_index: context.config.defaultIndex,
    allowed_indices: context.config.allowedIndices,
    default_date_field: "end_time",
    date_fields: [
      {
        id: "end_time",
        field: SUPPORTED_DATE_FIELDS.end_time,
        label: "End Time",
        description: "Default job-end time field used by GRACC documentation examples."
      },
      {
        id: "timestamp",
        field: SUPPORTED_DATE_FIELDS.timestamp,
        label: "Document Timestamp",
        description: "Observed ingest timestamp field from the public mappings."
      }
    ],
    dimensions: DIMENSIONS.map((dimension) => ({
      id: dimension.id,
      field: dimension.field,
      label: dimension.label,
      description: dimension.description,
      category: dimension.category,
      value_type: dimension.valueType,
      filterable: dimension.filterable,
      groupable: dimension.groupable,
      aliases: dimension.aliases,
      example_values: includeExamples ? dimension.exampleValues : undefined,
      notes: dimension.notes
    })),
    metrics: METRICS.map((metric) => ({
      id: metric.id,
      field: metric.field,
      label: metric.label,
      description: metric.description,
      aggregation: metric.aggregation,
      unit: metric.unit,
      aliases: metric.aliases,
      notes: metric.notes
    }))
  };
};
