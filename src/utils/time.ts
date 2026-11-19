import { DateRange, NormalizedDateRange } from "../types.js";

export const parseDateRange = (start: string, end: string): NormalizedDateRange => {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date: ${start}`);
  }

  if (Number.isNaN(endDate.getTime())) {
    throw new Error(`Invalid end date: ${end}`);
  }

  if (endDate <= startDate) {
    throw new Error("The end date must be later than the start date.");
  }

  return {
    start,
    end,
    startDate,
    endDate
  };
};

export const daysBetween = (range: DateRange): number => {
  const start = new Date(range.start);
  const end = new Date(range.end);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
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
