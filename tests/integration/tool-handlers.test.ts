import { describe, expect, it, vi } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";
import { queryUsageSummary } from "../../src/tools/queryUsageSummary.js";
import { runSafeQuery } from "../../src/tools/runSafeQuery.js";
import { timeSeriesUsage } from "../../src/tools/timeSeriesUsage.js";

const emptyResponse = () =>
  new Response(
    JSON.stringify({
      took: 1,
      timed_out: false,
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {}
    }),
    { status: 200 }
  );

const sentBody = (fetchImpl: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse(fetchImpl.mock.calls[call][1].body as string);

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

  it("sends normalized UTC dates upstream, not the raw input strings", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => emptyResponse());
    const config = loadConfig();
    const client = new OpenSearchClient(config, { fetchImpl });

    await queryUsageSummary(
      { start: "2026-04-01", end: "2026-04-08T06:00:00-05:00" },
      { config, client }
    );

    expect(sentBody(fetchImpl).query.bool.filter[0]).toEqual({
      range: { EndTime: { gte: "2026-04-01T00:00:00.000Z", lt: "2026-04-08T11:00:00.000Z" } }
    });
  });

  it("rejects an invalid time_zone before querying GRACC", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => emptyResponse());
    const config = loadConfig();
    const client = new OpenSearchClient(config, { fetchImpl });

    await expect(
      timeSeriesUsage(
        { start: "2026-04-01", end: "2026-04-08", interval: "day", time_zone: "Mars/Olympus_Mons" },
        { config, client }
      )
    ).rejects.toThrow(/time_zone/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("run_safe_query sends the rebuilt body, not the raw input", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => emptyResponse());
    const config = loadConfig();
    const client = new OpenSearchClient(config, { fetchImpl });

    await runSafeQuery(
      { body: { size: 5, query: { range: { EndTime: { gte: "2026-04-01", lt: "2026-04-08" } } } } },
      { config, client }
    );

    const sent = sentBody(fetchImpl);
    expect(sent.query).toEqual({
      range: { EndTime: { gte: "2026-04-01T00:00:00.000Z", lt: "2026-04-08T00:00:00.000Z" } }
    });
    expect(Array.isArray(sent._source)).toBe(true);
  });
});
