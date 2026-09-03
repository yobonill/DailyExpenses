import { describe, expect, it } from "vitest";
import { applyFinancialUpdates, createEmptyFinancialData } from "./financialState";
import { calculateReportTotals, getCardCurrentDebt } from "./financialCalculations";
import { isFinanciallyConsistent } from "./financialIntegrity";
import { buildStartingPointReconciliationUpdates } from "./startingPointReconciliation";

const metadata = {
  createdAt: "2026-08-01T12:00:00.000Z",
  createdBy: "u1",
  updatedAt: "2026-08-01T12:00:00.000Z",
  updatedBy: "u1",
  version: 1,
};

const createScenario = () => {
  const data = createEmptyFinancialData();
  data.creditCards.card = {
    id: "card",
    name: "Visa",
    cutDay: 15,
    dueDay: 10,
    active: true,
    openingCurrentDebtDopMinor: 5887564,
    openingCurrentDebtUsdMinor: 12269,
    openingStatementDopMinor: 6786327,
    openingStatementUsdMinor: 10981,
    openingDate: "2026-07-30",
    ...metadata,
  };
  data.monthlyOccurrences.internet = {
    id: "internet",
    name: "Internet",
    expectedAmountMinor: 140000,
    currency: "DOP",
    dueDate: "2026-08-19",
    financialMonth: "2026-08",
    quincena: 2,
    status: "upcoming",
    canPayWithCard: true,
    oneTime: false,
    ...metadata,
  };
  data.incomeOccurrences.salary = {
    id: "salary",
    name: "Nómina",
    incomeType: "salary",
    expectedAmountMinor: 3000000,
    currency: "DOP",
    expectedDate: "2026-08-30",
    financialMonth: "2026-08",
    quincena: 2,
    status: "expected",
    oneTime: false,
    exportExpectedWhenPending: true,
    ...metadata,
  };
  return data;
};

describe("starting-point reconciliation", () => {
  it("settles existing records without changing registered card debt or creating a card transaction", () => {
    const data = createScenario();
    const debtBefore = getCardCurrentDebt(data, "card", "DOP");
    const updates = buildStartingPointReconciliationUpdates(data, {
      trackingStartDate: "2026-09-03",
      historicalSource: "creditCardOpeningBalance",
      cardId: "card",
      bills: [{ occurrenceId: "internet", amountMinor: 135000 }],
      incomes: [{ occurrenceId: "salary", amountMinor: 3000000 }],
    }, "u1", "2026-09-03T14:00:00.000Z");
    const reconciled = applyFinancialUpdates(data, updates);
    const payment = Object.values(reconciled.payments)[0];

    expect(reconciled.monthlyOccurrences.internet).toMatchObject({
      status: "paid",
      actualAmountMinor: 135000,
      reconciledAt: "2026-09-03T14:00:00.000Z",
    });
    expect(payment).toMatchObject({
      method: "creditCard",
      historical: true,
      historicalSource: "creditCardOpeningBalance",
      cardId: "card",
    });
    expect(reconciled.incomeOccurrences.salary).toMatchObject({
      status: "received",
      actualAmountMinor: 3000000,
      receivedDate: "2026-09-03",
    });
    expect(Object.keys(reconciled.cardTransactions)).toHaveLength(0);
    expect(getCardCurrentDebt(reconciled, "card", "DOP")).toBe(debtBefore);
    expect(reconciled.settings.trackingStartDate).toBe("2026-09-03");
    expect(isFinanciallyConsistent(reconciled)).toBe(true);
  });

  it("includes historical bills in spending without treating them as a new cash outflow", () => {
    const data = createScenario();
    const updates = buildStartingPointReconciliationUpdates(data, {
      trackingStartDate: "2026-09-03",
      historicalSource: "cashOrBankBeforeTracking",
      bills: [{ occurrenceId: "internet", amountMinor: 140000 }],
      incomes: [],
    }, "u1", "2026-09-03T14:00:00.000Z");
    const reconciled = applyFinancialUpdates(data, updates);
    const report = calculateReportTotals(reconciled, [], ["2026-08"], "all", "DOP");

    expect(report.monthlyPaid).toBe(140000);
    expect(report.spending).toBe(140000);
    expect(report.cashFlow).toBe(0);
    expect(report.planningCommitments).toBe(140000);
  });

  it("keeps the first tracking date fixed and rejects stale or empty selections", () => {
    const data = createScenario();
    data.settings.trackingStartDate = "2026-09-03";

    expect(() => buildStartingPointReconciliationUpdates(data, {
      trackingStartDate: "2026-09-04",
      historicalSource: "unknown",
      bills: [{ occurrenceId: "internet", amountMinor: 140000 }],
      incomes: [],
    }, "u1")).toThrow(/fecha de inicio ya fue establecida/i);
    expect(() => buildStartingPointReconciliationUpdates(data, {
      trackingStartDate: "2026-09-03",
      historicalSource: "unknown",
      bills: [],
      incomes: [],
    }, "u1")).toThrow(/selecciona al menos/i);
  });
});
