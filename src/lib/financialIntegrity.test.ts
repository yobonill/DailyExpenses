import { describe, expect, it } from "vitest";
import { createEmptyFinancialData } from "./financialState";
import { isFinanciallyConsistent, reconcileVersionedUpdates } from "./financialIntegrity";

const metadata = {
  createdAt: "2026-01-01T00:00:00.000Z", createdBy: "u1",
  updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "u1", version: 1,
};

describe("shared financial integrity", () => {
  it("rejects stale edits and skips duplicate idempotent generation", () => {
    const data = createEmptyFinancialData();
    data.monthlyTemplates.internet = {
      id: "internet", name: "Internet", estimatedAmountMinor: 1000, currency: "DOP",
      dueRule: { kind: "day", day: 18 }, variableAmount: false, canPayWithCard: true,
      active: true, ...metadata, version: 2,
    };
    expect(reconcileVersionedUpdates(data, {
      "monthlyTemplates/internet": { ...data.monthlyTemplates.internet, name: "stale", version: 2 },
    }).conflict).toBe(true);
    expect(reconcileVersionedUpdates(data, {
      "monthlyTemplates/internet": { ...data.monthlyTemplates.internet, version: 1 },
    })).toEqual({ updates: {}, conflict: false });
  });

  it("rejects duplicate active payments and savings oversubscription", () => {
    const data = createEmptyFinancialData();
    data.payments.one = { id: "one", sourceType: "monthly", sourceId: "bill", amountMinor: 1000, currency: "DOP", paidDate: "2026-01-18", method: "cash", ...metadata };
    data.payments.two = { id: "two", sourceType: "monthly", sourceId: "bill", amountMinor: 1000, currency: "DOP", paidDate: "2026-01-18", method: "cash", ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(false);

    delete data.payments.two;
    data.savingsFunds.fund = { id: "fund", name: "Fondo", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "fund", type: "deposit", amountMinor: 1000, currency: "DOP", transactionDate: "2026-01-01", ...metadata };
    data.nonMonthlyOccurrences.future = { id: "future", planId: "plan", name: "Seguro", expectedAmountMinor: 2000, currency: "DOP", dueDate: "2026-12-01", status: "upcoming", canPayWithCard: true, ...metadata };
    data.savingsAllocations.allocation = { id: "allocation", fundId: "fund", obligationType: "nonMonthly", obligationId: "future", amountMinor: 1500, currency: "DOP", active: true, ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });
});
