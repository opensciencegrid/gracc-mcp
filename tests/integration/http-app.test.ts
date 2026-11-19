import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenSearchClient } from "../../src/client/opensearch.js";
import { loadConfig } from "../../src/config/env.js";
import { createHttpApp } from "../../src/http/app.js";
import { ServerConfig } from "../../src/types.js";

const base = loadConfig();

const configWith = (overrides: Partial<ServerConfig>): ServerConfig => ({ ...base, ...overrides });

const rpc = (id: number, method: string, params: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method,
  params
});

const post = (app: ReturnType<typeof createHttpApp>, body: unknown) =>
  request(app)
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json")
    .send(body as object);

const parseRpc = (res: request.Response) => {
  const dataLine = res.text.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine ? dataLine.slice("data: ".length) : res.text);
};

const summaryResponse = () =>
  new Response(
    JSON.stringify({
      took: 1,
      timed_out: false,
      hits: { total: { value: 3, relation: "eq" }, hits: [] },
      aggregations: { job_count: { value: 1 }, core_hours: { value: 2 } }
    }),
    { status: 200 }
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP app", () => {
  it("returns a JSON-RPC 429 once a client exceeds the per-IP limit", async () => {
    const config = configWith({ rateLimit: { windowMs: 60_000, max: 2 } });
    const app = createHttpApp(config, new OpenSearchClient(config, { fetchImpl: vi.fn() }));

    expect((await post(app, rpc(1, "tools/list"))).status).toBe(200);
    expect((await post(app, rpc(2, "tools/list"))).status).toBe(200);

    const limited = await post(app, rpc(3, "tools/list"));
    expect(limited.status).toBe(429);
    expect(limited.body.jsonrpc).toBe("2.0");
    expect(limited.body.error.message).toMatch(/rate limit/i);
  });

  it("does not rate limit when the limit is 0", async () => {
    const config = configWith({ rateLimit: { windowMs: 60_000, max: 0 } });
    const app = createHttpApp(config, new OpenSearchClient(config, { fetchImpl: vi.fn() }));

    for (let id = 1; id <= 4; id += 1) {
      expect((await post(app, rpc(id, "tools/list"))).status).toBe(200);
    }
  });

  it("omits run_safe_query from tools/list when it is disabled", async () => {
    const config = configWith({ enableSafeQuery: false });
    const app = createHttpApp(config, new OpenSearchClient(config, { fetchImpl: vi.fn() }));

    const names = parseRpc(await post(app, rpc(1, "tools/list"))).result.tools.map(
      (tool: { name: string }) => tool.name
    );

    expect(names).toContain("top_n_entities");
    expect(names).not.toContain("run_safe_query");
  });

  it("shares one upstream client across HTTP requests so the cache applies", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => summaryResponse());
    vi.stubGlobal("fetch", fetchMock);
    const app = createHttpApp(configWith({ rateLimit: { windowMs: 60_000, max: 0 } }));

    const call = rpc(1, "tools/call", {
      name: "query_usage_summary",
      arguments: { start: "2026-04-01", end: "2026-04-08", metrics: ["job_count", "core_hours"] }
    });

    const first = parseRpc(await post(app, call));
    const second = parseRpc(await post(app, call));

    expect(first.result.isError).toBeFalsy();
    expect(second.result.structuredContent.matched_documents).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
