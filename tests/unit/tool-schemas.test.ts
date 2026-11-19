import { describe, expect, it } from "vitest";

import { listDimensionsSchema } from "../../src/tools/listDimensions.js";
import { queryUsageSummarySchema } from "../../src/tools/queryUsageSummary.js";
import { runSafeQuerySchema } from "../../src/tools/runSafeQuery.js";
import { timeSeriesUsageSchema } from "../../src/tools/timeSeriesUsage.js";
import { topNEntitiesSchema } from "../../src/tools/topNEntities.js";

describe("tool input parsing", () => {
  it("parses list_dimensions input", () => {
    expect(listDimensionsSchema.parse({ include_examples: false })).toEqual({
      include_examples: false
    });
  });

  it("parses usage summary input", () => {
    const parsed = queryUsageSummarySchema.parse({
      start: "2026-04-01",
      end: "2026-04-08",
      metrics: ["core_hours"],
      filters: {
        vo_name: "ligo"
      }
    });

    expect(parsed.metrics).toEqual(["core_hours"]);
  });

  it("parses top n input", () => {
    const parsed = topNEntitiesSchema.parse({
      start: "2026-04-01",
      end: "2026-04-08",
      dimension: "project_name"
    });

    expect(parsed.dimension).toBe("project_name");
  });

  it("parses time series input", () => {
    const parsed = timeSeriesUsageSchema.parse({
      start: "2026-04-01",
      end: "2026-04-08",
      interval: "day"
    });

    expect(parsed.interval).toBe("day");
  });

  it("requires a body for run_safe_query", () => {
    expect(() => runSafeQuerySchema.parse({})).toThrow();
  });
});
