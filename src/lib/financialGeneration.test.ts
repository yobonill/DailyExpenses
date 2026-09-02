import { describe, expect, it } from "vitest";
import { applyFinancialUpdates, createEmptyFinancialData } from "./financialState";
import { buildGenerationUpdates, buildPausedMonthlyOccurrenceUpdates } from "./financialGeneration";

const metadata = {
  createdAt: "2026-09-02T12:00:00.000Z",
  createdBy: "user-a",
  updatedAt: "2026-09-02T12:00:00.000Z",
  updatedBy: "user-a",
  version: 1,
};

describe("recurring generation", () => {
  it("creates deterministic monthly and income occurrences through 12 future months", () => {
    const data = createEmptyFinancialData();
    data.monthlyTemplates.internet = {
      id: "internet", name: "Internet", estimatedAmountMinor: 150000, currency: "DOP",
      dueRule: { kind: "day", day: 5 }, variableAmount: false, canPayWithCard: true,
      plannedQuincena: 1, active: true, excelRowLabel: "Internet", ...metadata,
    };
    data.incomeTemplates.salary = {
      id: "salary", name: "Nómina", incomeType: "salary", expectedAmountMinor: 5000000,
      currency: "DOP", dueRule: { kind: "day", day: 30 }, active: true,
      exportExpectedWhenPending: true, excelRowLabel: "Nomina yor", ...metadata,
    };
    const updates = buildGenerationUpdates(data, "user-a", new Date("2026-09-02T12:00:00.000Z"));
    expect(updates["monthlyOccurrences/internet_2026-08"]).toMatchObject({
      dueDate: "2026-09-05", financialMonth: "2026-08", quincena: 1,
    });
    expect(updates["monthlyOccurrences/internet_2027-08"]).toBeDefined();
    expect(updates["incomeOccurrences/salary_2026-08-30"]).toMatchObject({ quincena: 2 });

    const generated = applyFinancialUpdates(data, updates);
    expect(buildGenerationUpdates(generated, "user-b", new Date("2026-09-02T12:00:00.000Z"))).toEqual({});
  });

  it("pauses only future unpaid projections and preserves the current period and paid history", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.current = {
      id: "current", templateId: "internet", name: "Internet", expectedAmountMinor: 150000,
      currency: "DOP", dueDate: "2026-09-05", financialMonth: "2026-08", quincena: 1,
      status: "upcoming", canPayWithCard: true, oneTime: false, ...metadata,
    };
    data.monthlyOccurrences.future = {
      id: "future", templateId: "internet", name: "Internet", expectedAmountMinor: 150000,
      currency: "DOP", dueDate: "2026-10-05", financialMonth: "2026-09", quincena: 1,
      status: "upcoming", canPayWithCard: true, oneTime: false, ...metadata,
    };
    data.monthlyOccurrences.paid = {
      id: "paid", templateId: "internet", name: "Internet", expectedAmountMinor: 150000,
      actualAmountMinor: 152000, currency: "DOP", dueDate: "2026-10-05", financialMonth: "2026-09",
      quincena: 1, status: "paid", canPayWithCard: true, oneTime: false, ...metadata,
    };
    data.monthlyOccurrences.other = {
      id: "other", templateId: "water", name: "Agua", expectedAmountMinor: 50000,
      currency: "DOP", dueDate: "2026-10-10", financialMonth: "2026-09", quincena: 1,
      status: "upcoming", canPayWithCard: false, oneTime: false, ...metadata,
    };

    expect(buildPausedMonthlyOccurrenceUpdates(data, "internet", "2026-08")).toEqual({
      "monthlyOccurrences/future": null,
    });
  });

  it("creates one future-expense occurrence and does not duplicate it", () => {
    const data = createEmptyFinancialData();
    data.nonMonthlyExpenses.insurance = {
      id: "insurance", name: "Seguro", estimatedAmountMinor: 3200000, currency: "DOP",
      nextDueDate: "2026-12-15", recurrenceKind: "years", recurrenceInterval: 1,
      warningMonths: 3, canPayWithCard: true, active: true, ...metadata,
    };
    const updates = buildGenerationUpdates(data, "user-a", new Date("2026-09-02T12:00:00.000Z"));
    expect(updates["nonMonthlyOccurrences/insurance_2026-12-15"]).toMatchObject({ name: "Seguro" });
    expect(buildGenerationUpdates(applyFinancialUpdates(data, updates), "user-a", new Date("2026-09-02T12:00:00.000Z"))).toEqual({});
  });

  it("closes card statements by cut date and preserves separate opening ledgers", () => {
    const data = createEmptyFinancialData();
    data.creditCards.visa = {
      id: "visa", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 10000, openingCurrentDebtUsdMinor: 500,
      openingStatementDopMinor: 8000, openingStatementUsdMinor: 300,
      openingDate: "2026-09-02", ...metadata,
    };
    data.cardTransactions.cutDay = {
      id: "cutDay", cardId: "visa", currency: "DOP", type: "charge", amountMinor: 2000,
      transactionDate: "2026-08-20", description: "En el corte", ...metadata,
    };
    data.cardTransactions.nextCycle = {
      id: "nextCycle", cardId: "visa", currency: "DOP", type: "charge", amountMinor: 5000,
      transactionDate: "2026-08-21", description: "Nuevo ciclo", ...metadata,
    };
    const updates = buildGenerationUpdates(data, "user-a", new Date("2026-09-02T12:00:00.000Z"));
    expect(updates["cardStatements/visa_DOP_2026-08-20"]).toMatchObject({
      cycleStartDate: "2026-07-21", dueDate: "2026-09-15", statementAmountMinor: 10000,
    });
    expect(updates["cardStatements/visa_USD_2026-08-20"]).toMatchObject({ statementAmountMinor: 300 });
  });
});
