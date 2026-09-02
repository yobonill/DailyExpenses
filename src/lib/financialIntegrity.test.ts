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

  it("accepts only USD card payments with a positive DOP settlement", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 1000,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 1000,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardTransactions.payment = {
      id: "payment", cardId: "card", currency: "USD", type: "payment", amountMinor: 1000,
      settlementAmountDopMinor: 62500, transactionDate: "2026-08-20", description: "Pago USD", ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);

    data.cardTransactions.payment = {
      ...data.cardTransactions.payment,
      currency: "DOP",
    };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("rejects concurrent card payments that would overpay the balance", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 1000,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 1000,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardTransactions.first = {
      id: "first", cardId: "card", currency: "USD", type: "payment", amountMinor: 700,
      settlementAmountDopMinor: 43750, transactionDate: "2026-08-20", description: "Primer pago", ...metadata,
    };
    data.cardTransactions.second = {
      id: "second", cardId: "card", currency: "USD", type: "payment", amountMinor: 700,
      settlementAmountDopMinor: 43750, transactionDate: "2026-08-20", description: "Segundo pago", ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("validates purchase-goal savings and linked card purchases", () => {
    const data = createEmptyFinancialData();
    data.purchaseGoals.tv = {
      id: "tv", name: "Televisor", estimatedAmountMinor: 5000000, currency: "DOP",
      priority: "high", status: "purchased", purchaseMethod: "creditCard",
      linkedCardTransactionId: "charge", ...metadata,
    };
    data.savingsFunds.home = { id: "home", name: "Hogar", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "home", type: "deposit", amountMinor: 1000000, currency: "DOP", transactionDate: "2026-08-01", ...metadata };
    data.savingsAllocations.tv = { id: "allocation", fundId: "home", obligationType: "purchaseGoal", obligationId: "tv", amountMinor: 1000000, currency: "DOP", active: true, ...metadata };
    data.creditCards.card = { id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-08-01", ...metadata };
    data.cardTransactions.charge = { id: "charge", cardId: "card", currency: "DOP", type: "charge", amountMinor: 5000000, transactionDate: "2026-08-20", description: "Televisor", linkedPurchaseGoalId: "tv", ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(true);

    delete data.purchaseGoals.tv;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("rejects invalid card payment plans", () => {
    const data = createEmptyFinancialData();
    data.cardPaymentPlans.plan = {
      id: "plan", financialMonth: "2026-08", quincena: 1,
      plannedDopMinor: 10000, plannedUsdMinor: 0, ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);
    data.cardPaymentPlans.plan.plannedDopMinor = -1;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("accepts only positive configured minimum payments", () => {
    const data = createEmptyFinancialData();
    data.cardStatements.statement = {
      id: "statement", cardId: "card", currency: "DOP", cycleStartDate: "2026-07-21",
      cutDate: "2026-08-20", dueDate: "2026-09-15", statementAmountMinor: 100000,
      minimumPaymentMinor: 10000, status: "open", ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);
    data.cardStatements.statement.minimumPaymentMinor = 0;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });
});
