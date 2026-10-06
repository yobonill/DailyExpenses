import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFinanceActions, type IncomeTemplateInput } from "../hooks/useFinanceActions";
import { applyFinancialUpdates, createEmptyFinancialData } from "./financialState";
import { buildClosing, closingNeedsReview, reviewMeta } from "./financialReview";
import { prepareReviewedUpdates } from "./reviewedUpdates";
import { buildGenerationUpdates } from "./financialGeneration";
import type { AppUserDefinition } from "../config/appUsers";
import type { FinancialData } from "../models/finance";

const user = { uid: "tester" } as AppUserDefinition;
const metadata = reviewMeta(user.uid);
const input = (active: boolean, amount = 20_000): IncomeTemplateInput => ({
  name: "Rivia", incomeType: "recurringOther", expectedAmountMinor: amount, currency: "DOP",
  dueRule: { kind: "day", day: 18 }, active, exportExpectedWhenPending: true,
});

const fixture = (): FinancialData => {
  const data = createEmptyFinancialData();
  data.moneyAccounts.cash = {
    id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 10_000,
    openingDate: "2026-09-15", active: true, ...metadata,
  };
  data.incomeTemplates.rivia = { id: "rivia", ...input(true), ...metadata };
  data.incomeOccurrences.received = {
    id: "received", templateId: "rivia", name: "Rivia", incomeType: "recurringOther", expectedAmountMinor: 20_000,
    actualAmountMinor: 20_000, currency: "DOP", expectedDate: "2026-09-18", receivedDate: "2026-09-20",
    financialMonth: "2026-09", quincena: 1, status: "received", oneTime: false, exportExpectedWhenPending: true, ...metadata,
  };
  data.incomeOccurrences.overdue = {
    id: "overdue", templateId: "rivia", name: "Rivia", incomeType: "recurringOther", expectedAmountMinor: 20_000,
    currency: "DOP", expectedDate: "2026-09-10", financialMonth: "2026-08", quincena: 2,
    status: "expected", oneTime: false, exportExpectedWhenPending: true, ...metadata,
  };
  data.incomeOccurrences.future = {
    id: "future", templateId: "rivia", name: "Rivia", incomeType: "recurringOther", expectedAmountMinor: 20_000,
    currency: "DOP", expectedDate: "2026-10-18", financialMonth: "2026-10", quincena: 1,
    status: "expected", oneTime: false, exportExpectedWhenPending: true, ...metadata,
  };
  data.incomeOccurrences.later = {
    id: "later", templateId: "rivia", name: "Rivia", incomeType: "recurringOther", expectedAmountMinor: 20_000,
    currency: "DOP", expectedDate: "2026-11-18", financialMonth: "2026-11", quincena: 1,
    status: "expected", oneTime: false, exportExpectedWhenPending: true, ...metadata,
  };
  return data;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("income template history boundaries", () => {
  it("deactivates a source by removing only future expected projections", async () => {
    const data = fixture();
    const closing = buildClosing(data, "2026-09", 1, { "account:cash": 10_000 }, "", user.uid);
    data.cycleClosings[closing.id] = closing;
    let rawPatch: Record<string, unknown> = {};
    await createFinanceActions({ data, user, commitUpdates: async (patch) => { rawPatch = patch; } })
      .saveIncomeTemplate(input(false), "rivia");

    expect(rawPatch["incomeOccurrences/future"]).toBeNull();
    expect(rawPatch["incomeOccurrences/later"]).toBeNull();
    expect(rawPatch["incomeOccurrences/received"]).toBeUndefined();
    expect(rawPatch["incomeOccurrences/overdue"]).toBeUndefined();

    let confirmationCount = 0;
    const reviewed = prepareReviewedUpdates(data, rawPatch, user.uid, {
      warn: () => undefined,
      confirm: () => { confirmationCount += 1; return true; },
    });
    const result = applyFinancialUpdates(data, reviewed);
    expect(confirmationCount).toBe(0);
    expect(result.incomeOccurrences.received.status).toBe("received");
    expect(result.incomeOccurrences.overdue.status).toBe("expected");
    expect(result.incomeOccurrences.future).toBeUndefined();
    expect(result.incomeOccurrences.later).toBeUndefined();
    expect(result.incomeTemplates.rivia.active).toBe(false);
    expect(closingNeedsReview(result, result.cycleClosings[closing.id])).toBe(false);
  });

  it("edits future projections without rewriting received or overdue history", async () => {
    const data = fixture();
    let rawPatch: Record<string, unknown> = {};
    await createFinanceActions({ data, user, commitUpdates: async (patch) => { rawPatch = patch; } })
      .saveIncomeTemplate(input(true, 25_000), "rivia");
    const result = applyFinancialUpdates(data, rawPatch);
    expect(result.incomeOccurrences.received.expectedAmountMinor).toBe(20_000);
    expect(result.incomeOccurrences.overdue.expectedAmountMinor).toBe(20_000);
    expect(Object.values(result.incomeOccurrences).find((item) => item.expectedDate === "2026-10-18")?.expectedAmountMinor).toBe(25_000);
    expect(Object.values(result.incomeOccurrences).find((item) => item.expectedDate === "2026-11-18")?.expectedAmountMinor).toBe(25_000);
  });

  it("does not resurrect missed months when an inactive source is reactivated later", async () => {
    let data = fixture();
    let patch: Record<string, unknown> = {};
    await createFinanceActions({ data, user, commitUpdates: async (value) => { patch = value; } })
      .saveIncomeTemplate(input(false), "rivia");
    data = applyFinancialUpdates(data, patch);

    vi.setSystemTime(new Date("2026-12-01T12:00:00Z"));
    patch = {};
    await createFinanceActions({ data, user, commitUpdates: async (value) => { patch = value; } })
      .saveIncomeTemplate(input(true), "rivia");
    data = applyFinancialUpdates(data, patch);
    expect(data.incomeTemplates.rivia.generationStartDate).toBe("2026-12-01");

    const generated = buildGenerationUpdates(data, user.uid, new Date("2026-12-01T12:00:00Z"));
    expect(Object.keys(generated).some((key) => key.includes("2026-10-18"))).toBe(false);
    expect(Object.keys(generated).some((key) => key.includes("2026-11-18"))).toBe(false);
    expect(Object.keys(generated).some((key) => key.includes("2026-12-18"))).toBe(true);
  });
});
