import { DateRange, NormalizedDateRange } from "../types.js";

// Strict ISO-8601 only. Anything looser (bare numbers, date math, prose dates)
// is parsed differently by JavaScript and OpenSearch, which defeats range caps.
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Parse a strict ISO-8601 date or datetime. Values without an offset are UTC,
 * matching how OpenSearch interprets them.
 */
export const parseIsoInstant = (value: string, label: string): Date => {
  const match = typeof value === "string" ? ISO_INSTANT.exec(value) : null;
  if (!match) {
    throw new Error(
      `Invalid ${label} "${value}". Use an ISO 8601 date (2026-04-01) or datetime (2026-04-01T12:00:00Z).`
    );
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "0", zone] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(fraction.padEnd(3, "0").slice(0, 3))
  };

  const local = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond)
  );

  const isRealInstant =
    local.getUTCFullYear() === parts.year &&
    local.getUTCMonth() === parts.month - 1 &&
    local.getUTCDate() === parts.day &&
    local.getUTCHours() === parts.hour &&
    local.getUTCMinutes() === parts.minute &&
    local.getUTCSeconds() === parts.second;

  if (!isRealInstant) {
    throw new Error(`Invalid ${label} "${value}": not a real calendar date and time.`);
  }

  let offsetMinutes = 0;
  if (zone && zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const [offsetHours, offsetMins] = zone.slice(1).split(":").map(Number);
    if (offsetHours > 23 || offsetMins > 59) {
      throw new Error(`Invalid ${label} "${value}": bad UTC offset.`);
    }
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }

  return new Date(local.getTime() - offsetMinutes * 60 * 1000);
};

export const parseDateRange = (start: string, end: string): NormalizedDateRange => {
  const startDate = parseIsoInstant(start, "start date");
  const endDate = parseIsoInstant(end, "end date");

  if (endDate <= startDate) {
    throw new Error("The end date must be later than the start date.");
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    startDate,
    endDate
  };
};

export const daysBetween = (range: DateRange): number => {
  const start = new Date(range.start);
  const end = new Date(range.end);
  return (end.getTime() - start.getTime()) / MS_PER_DAY;
};

export const estimateBucketCount = (
  range: DateRange,
  interval: "day" | "week" | "month"
): number => {
  const dayCount = daysBetween(range);

  switch (interval) {
    case "day":
      return Math.ceil(dayCount);
    case "week":
      return Math.ceil(dayCount / 7);
    case "month":
      return Math.ceil(dayCount / 30.5);
    default:
      return Math.ceil(dayCount);
  }
};
