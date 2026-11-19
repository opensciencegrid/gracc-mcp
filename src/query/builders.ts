import { FilterSpec, OpenSearchSearchRequest } from "../types.js";
import { resolveMetric, resolveDimension, SUPPORTED_DATE_FIELDS } from "../schema/registry.js";

export interface SummaryQueryInput {
  start: string;
  end: string;
  filters: FilterSpec[];
  metricIds: string[];
  dateFieldId: keyof typeof SUPPORTED_DATE_FIELDS;
}

export interface TopNQueryInput extends SummaryQueryInput {
  dimensionId: string;
  metricId: string;
  limit: number;
}

export interface TimeSeriesQueryInput extends SummaryQueryInput {
  metricId: string;
  interval: "day" | "week" | "month";
  timeZone: string;
}

const buildFilterClause = (filters: FilterSpec[], start: string, end: string, dateField: string) => {
  const clauses: Record<string, unknown>[] = [
    {
      range: {
        [dateField]: {
          gte: start,
          lt: end
        }
      }
    }
  ];

  for (const filter of filters) {
    clauses.push(
      filter.values.length === 1
        ? {
            term: {
              [filter.field]: filter.values[0]
            }
          }
        : {
            terms: {
              [filter.field]: filter.values
            }
          }
    );
  }

  return clauses;
};

const buildMetricAggregation = (metricId: string) => {
  const metric = resolveMetric(metricId);
  if (!metric) {
    throw new Error(`Unsupported metric "${metricId}".`);
  }

  if (metric.aggregation === "doc_count") {
    throw new Error(`Metric "${metricId}" is not supported as an aggregation query metric.`);
  }

  if (!metric.field) {
    throw new Error(`Metric "${metricId}" is missing a backing field.`);
  }

  if (metric.aggregation === "value_count") {
    return {
      value_count: {
        field: metric.field
      }
    };
  }

  return {
    sum: {
      field: metric.field
    }
  };
};

export const buildSummaryQuery = (input: SummaryQueryInput): OpenSearchSearchRequest => {
  const dateField = SUPPORTED_DATE_FIELDS[input.dateFieldId];
  const aggs: Record<string, unknown> = {};

  for (const metricId of input.metricIds) {
    aggs[metricId] = buildMetricAggregation(metricId);
  }

  return {
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: buildFilterClause(input.filters, input.start, input.end, dateField)
      }
    },
    aggs
  };
};

export const buildTopNQuery = (input: TopNQueryInput): OpenSearchSearchRequest => {
  const dateField = SUPPORTED_DATE_FIELDS[input.dateFieldId];
  const dimension = resolveDimension(input.dimensionId);
  const metric = resolveMetric(input.metricId);

  if (!dimension) {
    throw new Error(`Unsupported dimension "${input.dimensionId}".`);
  }

  if (!metric) {
    throw new Error(`Unsupported metric "${input.metricId}".`);
  }

  return {
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: buildFilterClause(input.filters, input.start, input.end, dateField)
      }
    },
    aggs: {
      top_values: {
        terms: {
          field: dimension.field,
          size: input.limit,
          order: {
            metric_value: "desc"
          }
        },
        aggs: {
          metric_value: buildMetricAggregation(metric.id)
        }
      }
    }
  };
};

export const buildTimeSeriesQuery = (input: TimeSeriesQueryInput): OpenSearchSearchRequest => {
  const dateField = SUPPORTED_DATE_FIELDS[input.dateFieldId];
  const metric = resolveMetric(input.metricId);

  if (!metric) {
    throw new Error(`Unsupported metric "${input.metricId}".`);
  }

  return {
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: buildFilterClause(input.filters, input.start, input.end, dateField)
      }
    },
    aggs: {
      series: {
        date_histogram: {
          field: dateField,
          calendar_interval: input.interval,
          min_doc_count: 0,
          time_zone: input.timeZone,
          extended_bounds: {
            min: input.start,
            max: input.end
          }
        },
        aggs: {
          metric_value: buildMetricAggregation(metric.id)
        }
      }
    }
  };
};
