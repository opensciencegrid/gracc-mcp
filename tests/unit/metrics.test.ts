import { describe, expect, it } from "vitest";

import { toMetricOutput } from "../../src/tools/shared.js";

describe("metric formatting", () => {
  it("formats numeric metric values", () => {
    expect(toMetricOutput("core_hours", 42.5)).toEqual({
      id: "core_hours",
      label: "Core Hours",
      unit: "core-hours",
      value: 42.5
    });
  });

  it("coerces missing metric values to zero", () => {
    expect(toMetricOutput("job_count", undefined)).toEqual({
      id: "job_count",
      label: "Job Count",
      unit: "jobs",
      value: 0
    });
  });
});
