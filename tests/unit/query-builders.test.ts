import { describe, expect, it } from "vitest";

import { buildSummaryQuery, buildTimeSeriesQuery, buildTopNQuery } from "../../src/query/builders.js";

describe("query builders", () => {
  it("builds a summary query with exact-match filters", () => {
    const query = buildSummaryQuery({
      start: "2026-04-01",
      end: "2026-04-08",
      dateFieldId: "end_time",
      filters: [{ id: "vo_name", field: "VOName", values: ["ligo"] }],
      metricIds: ["job_count", "core_hours"]
    });

    expect(query).toEqual({
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { range: { EndTime: { gte: "2026-04-01", lt: "2026-04-08" } } },
            { term: { VOName: "ligo" } }
          ]
        }
      },
      aggs: {
        job_count: { sum: { field: "Njobs" } },
        core_hours: { sum: { field: "CoreHours" } }
      }
    });
  });

  it("builds a top n query ordered by metric value", () => {
    const query = buildTopNQuery({
      start: "2026-04-01",
      end: "2026-04-08",
      dateFieldId: "end_time",
      filters: [],
      metricIds: ["core_hours"],
      metricId: "core_hours",
      dimensionId: "project_name",
      limit: 5
    });

    expect(query.aggs).toEqual({
      top_values: {
        terms: {
          field: "ProjectName",
          size: 5,
          order: {
            metric_value: "desc"
          }
        },
        aggs: {
          metric_value: { sum: { field: "CoreHours" } }
        }
      }
    });
  });

  it("builds a time series query with extended bounds", () => {
    const query = buildTimeSeriesQuery({
      start: "2026-04-01",
      end: "2026-04-08",
      dateFieldId: "end_time",
      filters: [],
      metricIds: ["job_count"],
      metricId: "job_count",
      interval: "day",
      timeZone: "UTC"
    });

    expect(query.aggs).toEqual({
      series: {
        date_histogram: {
          field: "EndTime",
          calendar_interval: "day",
          min_doc_count: 0,
          time_zone: "UTC",
          extended_bounds: {
            min: "2026-04-01",
            max: "2026-04-08"
          }
        },
        aggs: {
          metric_value: { sum: { field: "Njobs" } }
        }
      }
    });
  });
});
