import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";

const originalEnv = {
  GRACC_BASE_URL: process.env.GRACC_BASE_URL,
  GRACC_DEFAULT_INDEX: process.env.GRACC_DEFAULT_INDEX,
  GRACC_ALLOWED_INDICES: process.env.GRACC_ALLOWED_INDICES,
  GRACC_HTTP_HOST: process.env.GRACC_HTTP_HOST
};

afterEach(() => {
  process.env.GRACC_BASE_URL = originalEnv.GRACC_BASE_URL;
  process.env.GRACC_DEFAULT_INDEX = originalEnv.GRACC_DEFAULT_INDEX;
  process.env.GRACC_ALLOWED_INDICES = originalEnv.GRACC_ALLOWED_INDICES;
  process.env.GRACC_HTTP_HOST = originalEnv.GRACC_HTTP_HOST;
});

describe("config loading", () => {
  it("strips wrapping quotes from string env vars", () => {
    process.env.GRACC_BASE_URL = "\"https://gracc.opensciencegrid.org/q\"";
    process.env.GRACC_DEFAULT_INDEX = "'gracc.osg.summary'";
    process.env.GRACC_ALLOWED_INDICES = "\"gracc.osg.summary, gracc.osg.summary2-oim\"";
    process.env.GRACC_HTTP_HOST = "'127.0.0.1'";

    const config = loadConfig();

    expect(config.baseUrl).toBe("https://gracc.opensciencegrid.org/q");
    expect(config.defaultIndex).toBe("gracc.osg.summary");
    expect(config.allowedIndices).toEqual(["gracc.osg.summary", "gracc.osg.summary2-oim"]);
    expect(config.httpHost).toBe("127.0.0.1");
  });
});
