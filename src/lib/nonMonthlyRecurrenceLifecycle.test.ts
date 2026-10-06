import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUserDefinition } from "../config/appUsers";
import { createFinanceActions, type NonMonthlyInput } from "../hooks/useFinanceActions";
import { applyFinancialUpdates, createEmptyFinancialData } from "./financialState";
import { reviewMeta } from "./financialReview";

const user = { uid: "tester" } as AppUserDefinition;
const metadata = reviewMeta(user.uid);

const therapyInput: NonMonthlyInput = {
  name: "Terapias",
  category: "Salud",
  estimatedAmountMinor: 150_000,
  currency: "DOP",
  nextDueDate: "2026-10-05",
  recurrenceKind: "weekdays",
  recurrenceInterval: 1,
  recurrenceWeekdays: [1, 2, 3, 4, 5],
  recurrenceEndDate: "2026-10-23",
  warningMonths: 0,
  canPayWithCard: false,
  active: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("non-monthly bounded recurrence lifecycle", () => {
  it("saves a weekday schedule as independent occurrences", async () => {
    let data = createEmptyFinancialData();
    let patch: Record<string, unknown> = {};
    await createFinanceActions({ data, user, commitUpdates: async (value) => { patch = value; } }).saveNonMonthly(therapyInput, "therapy");
    data = applyFinancialUpdates(data, patch);

    const sessions = Object.values(data.nonMonthlyOccurrences).filter((item) => item.planId === "therapy");
    expect(sessions).toHaveLength(15);
    expect(sessions.map((item) => item.dueDate)).not.toContain("2026-10-10");
    expect(data.nonMonthlyExpenses.therapy.recurrenceEndDate).toBe("2026-10-23");
  });

  it("pays one session without moving or deleting the rest of the schedule", async () => {
    let data = createEmptyFinancialData();
    data.moneyAccounts.cash = {
      id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 3_000_000,
      openingDate: "2026-10-01", active: true, ...metadata,
    };
    let patch: Record<string, unknown> = {};
    await createFinanceActions({ data, user, commitUpdates: async (value) => { patch = value; } }).saveNonMonthly(therapyInput, "therapy");
    data = applyFinancialUpdates(data, patch);

    await createFinanceActions({ data, user, commitUpdates: async (value) => { data = applyFinancialUpdates(data, value); } }).payObligation({
      sourceType: "nonMonthly",
      sourceId: "therapy_2026-10-05",
      amountMinor: 150_000,
      currency: "DOP",
      paidDate: "2026-10-05",
      method: "cash",
    });

    expect(data.nonMonthlyOccurrences["therapy_2026-10-05"].status).toBe("paid");
    expect(data.nonMonthlyOccurrences["therapy_2026-10-06"].status).toBe("upcoming");
    expect(data.nonMonthlyOccurrences["therapy_2026-10-23"].status).toBe("upcoming");
    expect(data.nonMonthlyExpenses.therapy.nextDueDate).toBe("2026-10-05");
    expect(data.nonMonthlyExpenses.therapy.active).toBe(true);
  });
});
