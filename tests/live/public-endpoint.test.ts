import { describe, expect, it } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";

const shouldRun = process.env.GRACC_LIVE_TESTS === "1";
const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe("public GRACC endpoint", () => {
  it("returns a summary aggregation from the documented public alias", async () => {
    const client = new OpenSearchClient(loadConfig());
    const response = await client.search("gracc.osg.summary", {
      size: 0,
      query: {
        range: {
          EndTime: {
            gte: "2026-04-01",
            lt: "2026-04-08"
          }
        }
      },
      aggs: {
        jobs: {
          sum: {
            field: "Njobs"
          }
        }
      }
    });

    expect(response.timed_out).toBe(false);
    expect(response.aggregations?.jobs.value).toBeTypeOf("number");
  });
});
