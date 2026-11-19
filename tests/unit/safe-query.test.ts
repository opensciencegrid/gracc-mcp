import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";
import { buildSafeQueryBody } from "../../src/validation/safeQuery.js";

const config = loadConfig();
const weekRange = { range: { EndTime: { gte: "2026-04-01", lt: "2026-04-08" } } };
const withRange = (extra: Record<string, unknown> = {}) => ({
  size: 0,
  query: { bool: { filter: [weekRange] } },
  ...extra
});

describe("run_safe_query body builder", () => {
  it("rebuilds an allowed query with resolved field names and normalized dates", () => {
    const built = buildSafeQueryBody(
      {
        size: 0,
        query: { bool: { filter: [{ term: { vo_name: "ligo" } }, weekRange] } },
        aggs: { jobs: { sum: { field: "job_count" } } }
      },
      config
    );

    expect(built).toEqual({
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { VOName: "ligo" } },
            {
              range: {
                EndTime: { gte: "2026-04-01T00:00:00.000Z", lt: "2026-04-08T00:00:00.000Z" }
              }
            }
          ]
        }
      },
      aggs: { jobs: { sum: { field: "Njobs" } } },
      _source: false
    });
  });

  it("rejects a script inside a metric aggregation", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({ aggs: { x: { sum: { field: "CoreHours", script: { source: "1" } } } } }),
        config
      )
    ).toThrow(/Unsupported key "script"/);
  });

  it("rejects extended_bounds on a date histogram", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({
          aggs: {
            x: {
              date_histogram: {
                field: "EndTime",
                calendar_interval: "day",
                extended_bounds: { min: 0, max: "2100-01-01" }
              }
            }
          }
        }),
        config
      )
    ).toThrow(/Unsupported key "extended_bounds"/);
  });

  it("rejects shard_size on a terms aggregation", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({ aggs: { x: { terms: { field: "VOName", size: 10, shard_size: 1000000 } } } }),
        config
      )
    ).toThrow(/Unsupported key "shard_size"/);
  });

  it("rejects include patterns on a terms aggregation", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({ aggs: { x: { terms: { field: "VOName", include: ".*a.*" } } } }),
        config
      )
    ).toThrow(/Unsupported key "include"/);
  });

  it("requires a query", () => {
    expect(() => buildSafeQueryBody({ size: 0 }, config)).toThrow(/requires a date range/);
  });

  it("requires a bounded date range in the query", () => {
    expect(() =>
      buildSafeQueryBody({ query: { bool: { filter: [{ term: { VOName: "ligo" } }] } } }, config)
    ).toThrow(/requires a date range/);
  });

  it("rejects a date range with no upper bound", () => {
    expect(() =>
      buildSafeQueryBody({ query: { range: { EndTime: { gte: "2026-04-01" } } } }, config)
    ).toThrow(/requires a date range/);
  });

  it("does not count a range inside must_not as the bound", () => {
    expect(() =>
      buildSafeQueryBody(
        {
          query: {
            bool: { filter: [{ term: { VOName: "ligo" } }], must_not: [weekRange] }
          }
        },
        config
      )
    ).toThrow(/requires a date range/);
  });

  it("rejects date ranges longer than the cap", () => {
    expect(() =>
      buildSafeQueryBody(
        { query: { range: { EndTime: { gte: "2024-01-01", lt: "2026-01-01" } } } },
        config
      )
    ).toThrow(/maximum of 366 days/);
  });

  it("rejects epoch-millisecond date values", () => {
    expect(() =>
      buildSafeQueryBody(
        { query: { range: { EndTime: { gte: 12, lt: "2002-06-01" } } } },
        config
      )
    ).toThrow(/ISO 8601/);
  });

  it("rejects date math in range values", () => {
    expect(() =>
      buildSafeQueryBody(
        { query: { range: { EndTime: { gte: "now-7d", lt: "2026-04-08" } } } },
        config
      )
    ).toThrow(/ISO 8601/);
  });

  it("rejects terms filters with too many values", () => {
    const values = Array.from({ length: 26 }, (_, index) => `vo${index}`);
    expect(() =>
      buildSafeQueryBody(
        { query: { bool: { filter: [weekRange, { terms: { VOName: values } }] } } },
        config
      )
    ).toThrow(/at most 25/);
  });

  it("rejects non-scalar terms values", () => {
    expect(() =>
      buildSafeQueryBody(
        { query: { bool: { filter: [weekRange, { terms: { VOName: [{ a: 1 }] } }] } } },
        config
      )
    ).toThrow(/strings, numbers, or booleans/);
  });

  it("rejects bool nesting deeper than the limit", () => {
    const deep = { bool: { filter: [{ bool: { filter: [{ bool: { filter: [{ term: { VOName: "x" } }] } }] } }] } };
    expect(() =>
      buildSafeQueryBody({ query: { bool: { filter: [weekRange, deep] } } }, config)
    ).toThrow(/nesting/);
  });

  it("defaults size to 0 so hits are only returned on request", () => {
    const built = buildSafeQueryBody({ query: weekRange }, config);
    expect(built.size).toBe(0);
  });

  it("limits returned fields to the allowlist when _source is omitted", () => {
    const built = buildSafeQueryBody(withRange({ size: 5 }), config);
    expect(Array.isArray(built._source)).toBe(true);
    expect(built._source).toEqual(expect.arrayContaining(["VOName", "CoreHours", "EndTime"]));
  });

  it("rejects more aggregations than the cap", () => {
    const aggs = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`m${index}`, { sum: { field: "CoreHours" } }])
    );
    expect(() => buildSafeQueryBody(withRange({ aggs }), config)).toThrow(
      /at most 10 aggregations/
    );
  });

  it("rejects aggregation trees whose bucket estimate exceeds the cap", () => {
    const daily = { date_histogram: { field: "EndTime", calendar_interval: "day" } };
    expect(() =>
      buildSafeQueryBody(
        {
          query: { range: { EndTime: { gte: "2026-01-01", lt: "2026-10-28" } } },
          aggs: {
            a: { terms: { field: "VOName", size: 25 }, aggs: { d: daily } },
            b: { terms: { field: "ProjectName", size: 25 }, aggs: { d: daily } }
          }
        },
        config
      )
    ).toThrow(/buckets/);
  });

  it("rejects a date histogram on a non-date field", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({ aggs: { x: { date_histogram: { field: "VOName", calendar_interval: "day" } } } }),
        config
      )
    ).toThrow(/date field/);
  });

  it("rejects sum on a non-metric field", () => {
    expect(() =>
      buildSafeQueryBody(withRange({ aggs: { x: { sum: { field: "VOName" } } } }), config)
    ).toThrow(/metric field/);
  });

  it("rejects terms ordering by an unknown sub-aggregation", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({ aggs: { top: { terms: { field: "VOName", order: { nope: "desc" } } } } }),
        config
      )
    ).toThrow(/order/);
  });

  it("accepts terms ordering by a child metric aggregation", () => {
    const built = buildSafeQueryBody(
      withRange({
        aggs: {
          top: {
            terms: { field: "vo_name", size: 5, order: { hours: "desc" } },
            aggs: { hours: { sum: { field: "core_hours" } } }
          }
        }
      }),
      config
    );

    expect(built.aggs).toEqual({
      top: {
        terms: { field: "VOName", size: 5, order: { hours: "desc" } },
        aggs: { hours: { sum: { field: "CoreHours" } } }
      }
    });
  });

  it("rejects sub-aggregations under a metric aggregation", () => {
    expect(() =>
      buildSafeQueryBody(
        withRange({
          aggs: { x: { sum: { field: "CoreHours" }, aggs: { y: { sum: { field: "Njobs" } } } } }
        }),
        config
      )
    ).toThrow(/cannot have sub-aggregations/);
  });
});
