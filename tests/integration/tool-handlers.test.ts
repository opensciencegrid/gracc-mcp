import { describe, expect, it, vi } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";
import { queryUsageSummary } from "../../src/tools/queryUsageSummary.js";

describe("tool handlers", () => {
  it("formats usage summary results from a mocked HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          took: 42,
          timed_out: false,
          hits: {
            total: {
              value: 99,
              relation: "eq"
            },
            hits: []
          },
          aggregations: {
            job_count: {
              value: 200
            },
            core_hours: {
              value: 400.5
            }
          }
        }),
        { status: 200 }
      )
    );

    const config = loadConfig();
    const client = new OpenSearchClient(config, { fetchImpl });
    const result = await queryUsageSummary(
      {
        start: "2026-04-01",
        end: "2026-04-08",
        metrics: ["job_count", "core_hours"],
        filters: {
          vo_name: "ligo"
        }
      },
      {
        config,
        client
      }
    );

    expect(result.matched_documents).toBe(99);
    expect(result.metrics).toEqual([
      {
        id: "job_count",
        label: "Job Count",
        unit: "jobs",
        value: 200
      },
      {
        id: "core_hours",
        label: "Core Hours",
        unit: "core-hours",
        value: 400.5
      }
    ]);
  });
});
