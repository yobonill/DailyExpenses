import { describe, expect, it } from "vitest";
import {
  addMonthsToDateKey,
  dateFromFinancialMonthRule,
  getFirstDueDateAfterCut,
  getLatestCutDate,
  nextOccurrenceDate,
  nonMonthlyOccurrenceDates,
} from "./financeDates";

describe("financial due dates", () => {
  it("places days 15-31 in the named month and days 1-14 in the following month", () => {
    expect(dateFromFinancialMonthRule("2026-08", { kind: "day", day: 18 })).toBe("2026-08-18");
    expect(dateFromFinancialMonthRule("2026-08", { kind: "day", day: 5 })).toBe("2026-09-05");
    expect(dateFromFinancialMonthRule("2027-02", { kind: "lastDay" })).toBe("2027-02-28");
  });

  it("clamps calendar recurrences and card dates", () => {
    expect(addMonthsToDateKey("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextOccurrenceDate("2028-02-29", "years", 1)).toBe("2029-02-28");
    expect(getLatestCutDate("2026-09-02", 20)).toBe("2026-08-20");
    expect(getFirstDueDateAfterCut("2026-08-20", 15)).toBe("2026-09-15");
  });
  it("expands weekday schedules inside an inclusive date limit", () => {
    const dates = nonMonthlyOccurrenceDates({
      startDate: "2026-10-05",
      recurrenceKind: "weekdays",
      recurrenceInterval: 1,
      recurrenceWeekdays: [1, 2, 3, 4, 5],
      endDate: "2026-10-23",
    });
    expect(dates).toHaveLength(15);
    expect(dates.slice(0, 5)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(dates.at(-1)).toBe("2026-10-23");
  });

  it("supports daily and weekly non-monthly recurrence intervals", () => {
    expect(nextOccurrenceDate("2026-10-05", "days", 2)).toBe("2026-10-07");
    expect(nextOccurrenceDate("2026-10-05", "weeks", 2)).toBe("2026-10-19");
  });

});
