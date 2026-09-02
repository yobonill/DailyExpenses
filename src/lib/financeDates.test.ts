import { describe, expect, it } from "vitest";
import {
  addMonthsToDateKey,
  dateFromFinancialMonthRule,
  getFirstDueDateAfterCut,
  getLatestCutDate,
  nextOccurrenceDate,
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
});
