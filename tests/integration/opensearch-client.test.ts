import { describe, expect, it, vi } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";

describe("OpenSearch client", () => {
  it("retries transient failures and returns JSON", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { reason: "try again" } }), { status: 503 }),
      new Response(
        JSON.stringify({
          took: 12,
          timed_out: false,
          hits: {
            total: {
              value: 1,
              relation: "eq"
            },
            hits: []
          },
          aggregations: {
            core_hours: {
              value: 123
            }
          }
        }),
        { status: 200 }
      )
    ];

    const fetchImpl = vi.fn().mockImplementation(async () => responses.shift());
    const client = new OpenSearchClient(loadConfig(), { fetchImpl });
    const response = await client.search("gracc.osg.summary", {
      size: 0
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.aggregations?.core_hours.value).toBe(123);
  });

  it("surfaces a clear error for malformed base URLs", async () => {
    const config = loadConfig();
    const client = new OpenSearchClient(
      {
        ...config,
        baseUrl: "\"https://gracc.opensciencegrid.org/q\""
      },
      { fetchImpl: vi.fn() }
    );

    await expect(
      client.search("gracc.osg.summary", {
        size: 0
      })
    ).rejects.toThrow(/Invalid GRACC_BASE_URL/);
  });
});
