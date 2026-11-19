import { ServerConfig, FilterSpec } from "../types.js";
import { resolveDimension, resolveMetric, SUPPORTED_DATE_FIELDS } from "../schema/registry.js";
import { estimateBucketCount, parseDateRange } from "../utils/time.js";

export const assertAllowedIndex = (config: ServerConfig, index?: string): string => {
  const selected = index ?? config.defaultIndex;
  if (!config.allowedIndices.includes(selected)) {
    throw new Error(
      `Unsupported index "${selected}". Allowed indices: ${config.allowedIndices.join(", ")}.`
    );
  }

  return selected;
};

export const assertSupportedDateField = (value?: string): keyof typeof SUPPORTED_DATE_FIELDS => {
  if (!value) {
    return "end_time";
  }

  if (!(value in SUPPORTED_DATE_FIELDS)) {
    throw new Error(
      `Unsupported date_field "${value}". Allowed values: ${Object.keys(
        SUPPORTED_DATE_FIELDS
      ).join(", ")}.`
    );
  }

  return value as keyof typeof SUPPORTED_DATE_FIELDS;
};

export const assertSupportedMetricIds = (metricIds: string[]): string[] => {
  if (metricIds.length === 0) {
    throw new Error("At least one metric must be requested.");
  }

  return metricIds.map((metricId) => {
    const metric = resolveMetric(metricId);
    if (!metric) {
      throw new Error(`Unsupported metric "${metricId}".`);
    }

    return metric.id;
  });
};

export const assertSupportedDimensionId = (dimensionId: string): string => {
  const dimension = resolveDimension(dimensionId);
  if (!dimension) {
    throw new Error(`Unsupported dimension "${dimensionId}".`);
  }

  if (!dimension.groupable) {
    throw new Error(`Dimension "${dimensionId}" is not groupable.`);
  }

  return dimension.id;
};

export const normalizeFilters = (
  filters: Record<string, string | string[]>,
  config: ServerConfig
): FilterSpec[] => {
  const entries = Object.entries(filters);

  return entries.map(([key, rawValue]) => {
    const dimension = resolveDimension(key);
    if (!dimension) {
      throw new Error(`Unsupported filter field "${key}".`);
    }

    if (!dimension.filterable) {
      throw new Error(`Field "${key}" is not available as a filter.`);
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    if (values.length === 0) {
      throw new Error(`Filter "${key}" must contain at least one value.`);
    }

    if (values.length > config.safety.maxFilterValues) {
      throw new Error(
        `Filter "${key}" exceeds the maximum of ${config.safety.maxFilterValues} values.`
      );
    }

    return {
      id: dimension.id,
      field: dimension.field,
      values
    };
  });
};

export const validateDateRange = (
  start: string,
  end: string,
  config: ServerConfig
) => {
  const range = parseDateRange(start, end);
  const rangeDays = (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24);

  if (rangeDays > config.safety.maxRangeDays) {
    throw new Error(
      `Date range exceeds the maximum of ${config.safety.maxRangeDays} days. Requested: ${rangeDays.toFixed(
        1
      )} days.`
    );
  }

  return range;
};

export const validateTopN = (limit: number | undefined, config: ServerConfig): number => {
  const selected = limit ?? 10;
  if (selected < 1 || selected > config.safety.maxTopN) {
    throw new Error(`limit must be between 1 and ${config.safety.maxTopN}.`);
  }

  return selected;
};

export const validateTimeSeriesInterval = (
  start: string,
  end: string,
  interval: "day" | "week" | "month",
  config: ServerConfig
) => {
  const buckets = estimateBucketCount({ start, end }, interval);
  if (buckets > config.safety.maxBuckets) {
    throw new Error(
      `The selected interval would create ${buckets} buckets, exceeding the maximum of ${config.safety.maxBuckets}.`
    );
  }

  return buckets;
};
