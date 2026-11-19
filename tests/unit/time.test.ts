import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/env.js";
import { parseIsoInstant } from "../../src/utils/time.js";
import { assertTimeZone, validateDateRange } from "../../src/validation/common.js";

describe("strict ISO-8601 date parsing", () => {
  const config = loadConfig();

  it("rejects a bare number that JavaScript would read as a month", () => {
    // V8 reads "12" as 2001-12-01; OpenSearch reads it as epoch millis (1970).
    expect(() => validateDateRange("12", "2002-06-01", config)).toThrow(/ISO 8601/);
  });

  it("rejects OpenSearch date math", () => {
    expect(() => validateDateRange("now-30d", "2026-04-08", config)).toThrow(/ISO 8601/);
  });

  it("rejects impossible calendar dates", () => {
    expect(() => validateDateRange("2026-02-30", "2026-03-08", config)).toThrow(
      /not a real calendar date/
    );
  });

  it("normalizes date-only values to UTC midnight", () => {
    const range = validateDateRange("2026-04-01", "2026-04-08", config);
    expect(range.start).toBe("2026-04-01T00:00:00.000Z");
    expect(range.end).toBe("2026-04-08T00:00:00.000Z");
  });

  it("treats datetimes without an offset as UTC", () => {
    expect(parseIsoInstant("2026-04-01T12:30:00", "start").toISOString()).toBe(
      "2026-04-01T12:30:00.000Z"
    );
  });

  it("applies explicit offsets", () => {
    expect(parseIsoInstant("2026-04-01T00:00:00-05:00", "start").toISOString()).toBe(
      "2026-04-01T05:00:00.000Z"
    );
  });
});

describe("time zone validation", () => {
  it("accepts IANA zones, UTC, and fixed offsets", () => {
    expect(assertTimeZone("America/Chicago")).toBe("America/Chicago");
    expect(assertTimeZone("UTC")).toBe("UTC");
    expect(assertTimeZone("+05:30")).toBe("+05:30");
  });

  it("rejects unknown zones", () => {
    expect(() => assertTimeZone("Mars/Olympus_Mons")).toThrow(/time_zone/);
  });
});
