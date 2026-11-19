import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";
import { assertAllowedIndex, normalizeFilters, validateDateRange, validateTimeSeriesInterval, validateTopN } from "../../src/validation/common.js";
import { validateSafeQueryBody } from "../../src/validation/safeQuery.js";

describe("validation common", () => {
  const config = loadConfig();

  it("accepts the documented default index", () => {
    expect(assertAllowedIndex(config, "gracc.osg.summary")).toBe("gracc.osg.summary");
  });

  it("rejects unsupported indices", () => {
    expect(() => assertAllowedIndex(config, "gracc.private.raw")).toThrow(/Unsupported index/);
  });

  it("normalizes exact-match filters", () => {
    const filters = normalizeFilters(
      {
        vo_name: "ligo",
        resource_type: ["Payload", "Batch"]
      },
      config
    );

    expect(filters).toEqual([
      { id: "vo_name", field: "VOName", values: ["ligo"] },
      { id: "resource_type", field: "ResourceType", values: ["Payload", "Batch"] }
    ]);
  });

  it("rejects date ranges above the hard cap", () => {
    expect(() =>
      validateDateRange("2024-01-01", "2026-01-02", config)
    ).toThrow(/maximum of/);
  });

  it("rejects top n values above the hard cap", () => {
    expect(() => validateTopN(999, config)).toThrow(/between 1 and/);
  });

  it("rejects time series requests that would exceed bucket limits", () => {
    expect(() =>
      validateTimeSeriesInterval("2024-01-01", "2025-12-31", "day", config)
    ).toThrow(/exceeding the maximum/);
  });
});

describe("safe query validation", () => {
  const config = loadConfig();

  it("accepts a constrained safe query", () => {
    expect(() =>
      validateSafeQueryBody(
        {
          size: 0,
          query: {
            bool: {
              filter: [
                { term: { VOName: "ligo" } },
                { range: { EndTime: { gte: "2026-04-01", lt: "2026-04-08" } } }
              ]
            }
          },
          aggs: {
            jobs: {
              sum: { field: "Njobs" }
            }
          }
        },
        config
      )
    ).not.toThrow();
  });

  it("rejects script usage", () => {
    expect(() =>
      validateSafeQueryBody(
        {
          size: 0,
          script: {
            source: "doc['CoreHours'].value"
          }
        },
        config
      )
    ).toThrow(/not supported/);
  });

  it("rejects query_string usage", () => {
    expect(() =>
      validateSafeQueryBody(
        {
          query: {
            query_string: {
              query: "VOName:ligo"
            }
          }
        },
        config
      )
    ).toThrow(/Unsupported query operator/);
  });
});
