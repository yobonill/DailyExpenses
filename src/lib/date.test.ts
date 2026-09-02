import { describe, expect, it } from "vitest";
import { getBudgetCycleRange, getMonthKey, getQuincena, getQuincenaRange } from "./date";

describe("financial month and quincena rules", () => {
  it.each([
    ["2026-08-15", "2026-08", 1],
    ["2026-08-29", "2026-08", 1],
    ["2026-08-30", "2026-08", 2],
    ["2026-09-14", "2026-08", 2],
    ["2026-09-15", "2026-09", 1],
  ] as const)("classifies %s", (dateKey, monthKey, quincena) => {
    expect(getMonthKey(dateKey)).toBe(monthKey);
    expect(getQuincena(dateKey)).toBe(quincena);
  });

  it("uses the actual last day of February as Q2 start", () => {
    expect(getQuincena("2027-02-27")).toBe(1);
    expect(getQuincena("2027-02-28")).toBe(2);
    expect(getQuincena("2028-02-28")).toBe(1);
    expect(getQuincena("2028-02-29")).toBe(2);
    expect(getQuincenaRange("2028-02", 2).startDateKey).toBe("2028-02-29");
  });

  it("creates the 15th through following 14th budget cycle", () => {
    expect(getBudgetCycleRange("2026-12")).toEqual({
      startDateKey: "2026-12-15",
      endDateKey: "2027-01-14",
    });
  });
});
