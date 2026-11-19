import * as z from "zod/v4";

import { OpenSearchClient } from "../client/opensearch.js";
import { resolveMetric } from "../schema/registry.js";
import { ServerConfig } from "../types.js";

export interface ToolContext {
  config: ServerConfig;
  client: OpenSearchClient;
}

export const filterValueSchema = z.union([z.string(), z.array(z.string()).min(1)]);

export const filtersSchema = z.record(z.string(), filterValueSchema).optional();

export const defaultSummaryMetricIds = [
  "job_count",
  "core_hours",
  "wall_duration_seconds",
  "cpu_duration_seconds",
  "processor_count_sum"
];

export const toMetricOutput = (
  metricId: string,
  rawValue: unknown
): { id: string; label: string; unit: string; value: number } => {
  const metric = resolveMetric(metricId);
  if (!metric) {
    throw new Error(`Unsupported metric "${metricId}".`);
  }

  return {
    id: metric.id,
    label: metric.label,
    unit: metric.unit,
    value: typeof rawValue === "number" ? rawValue : 0
  };
};
