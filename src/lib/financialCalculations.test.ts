import { describe, expect, it } from "vitest";
import type { Expense } from "../models/expense";
import { createEmptyFinancialData } from "./financialState";
import {
  calculateCardPaymentProjection,
  calculateReportTotals,
  getCardCurrentDebt,
  getCardDebtAtDate,
  getCardMinimumPaymentProgress,
  getCardSavingsCoverage,
  getFundAllocated,
  getFundBalance,
  getPurchaseGoalReserved,
  getUsdPaymentEffectiveRate,
} from "./financialCalculations";

const metadata = {
  createdAt: "2026-08-15T12:00:00.000Z", createdBy: "u1",
  updatedAt: "2026-08-15T12:00:00.000Z", updatedBy: "u1", version: 1,
};

describe("financial calculations", () => {
  it("keeps DOP and USD card ledgers separate and never counts card repayment as spending", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 10000, openingCurrentDebtUsdMinor: 500,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-08-01", ...metadata,
    };
    data.cardTransactions.linked = {
      id: "linked", cardId: "card", currency: "DOP", type: "charge", amountMinor: 20000,
      transactionDate: "2026-08-16", description: "Cena", linkedDailyExpenseId: "daily", ...metadata,
    };
    data.cardTransactions.manual = {
      id: "manual", cardId: "card", currency: "DOP", type: "charge", amountMinor: 30000,
      transactionDate: "2026-08-17", description: "Compra manual", ...metadata,
    };
    data.cardTransactions.payment = {
      id: "payment", cardId: "card", currency: "DOP", type: "payment", amountMinor: 15000,
      transactionDate: "2026-08-18", description: "Pago", ...metadata,
    };
    data.cardTransactions.usd = {
      id: "usd", cardId: "card", currency: "USD", type: "charge", amountMinor: 1000,
      transactionDate: "2026-08-18", description: "USD", ...metadata,
    };
    data.cardTransactions.usdPayment = {
      id: "usdPayment", cardId: "card", currency: "USD", type: "payment", amountMinor: 500,
      settlementAmountDopMinor: 31250, transactionDate: "2026-08-19", description: "Pago USD", ...metadata,
    };
    const expenses: Expense[] = [{
      id: "daily", name: "Cena", unitPriceCents: 20000, quantity: 1,
      occurredDate: "2026-08-16", occurredAt: "2026-08-16T12:00:00.000Z", status: "transferred",
      createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z",
    }];
    expect(getCardCurrentDebt(data, "card", "DOP")).toBe(45000);
    expect(getCardCurrentDebt(data, "card", "USD")).toBe(1000);
    expect(getCardDebtAtDate(data, "card", "DOP", "2026-08-16")).toBe(30000);
    const report = calculateReportTotals(data, expenses, ["2026-08"], "all", "DOP");
    expect(report.dailySpending).toBe(20000);
    expect(report.spending).toBe(50000);
    expect(report.cardPayments).toBe(46250);
    expect(report.cashFlow).toBe(-66250);

    const usdReport = calculateReportTotals(data, expenses, ["2026-08"], "all", "USD");
    expect(usdReport.cardPayments).toBe(500);
    expect(usdReport.cashFlow).toBe(0);
    expect(getUsdPaymentEffectiveRate(data.cardTransactions.usdPayment)).toBe(62.5);
  });

  it("counts a card-paid extra expense once without reducing cash before the card payment", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 0,
      openingDate: "2026-08-01", ...metadata,
    };
    data.incomeOccurrences.salary = {
      id: "salary", name: "Salario", incomeType: "salary", expectedAmountMinor: 100000,
      actualAmountMinor: 100000, currency: "DOP", expectedDate: "2026-08-15",
      receivedDate: "2026-08-15", financialMonth: "2026-08", quincena: 1,
      status: "received", oneTime: false, exportExpectedWhenPending: true, ...metadata,
    };
    data.cardTransactions.charge = {
      id: "charge", cardId: "card", currency: "DOP", type: "charge", amountMinor: 25000,
      transactionDate: "2026-08-16", description: "Cena", linkedDailyExpenseId: "daily", ...metadata,
    };
    const expenses: Expense[] = [{
      id: "daily", name: "Cena", unitPriceCents: 25000, quantity: 1,
      occurredDate: "2026-08-16", occurredAt: "2026-08-16T12:00:00.000Z",
      currency: "DOP", paymentMethod: "creditCard", status: "transferred",
      createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z",
    }];

    const report = calculateReportTotals(data, expenses, ["2026-08"], "all", "DOP");
    expect(report.dailySpending).toBe(25000);
    expect(report.dailyCardSpending).toBe(25000);
    expect(report.dailyCashSpending).toBe(0);
    expect(report.spending).toBe(25000);
    expect(report.cashFlow).toBe(100000);
    expect(report.planning).toBe(100000);
    expect(getCardCurrentDebt(data, "card", "DOP")).toBe(25000);
  });

  it("reduces available cash immediately for extras paid without credit", () => {
    const data = createEmptyFinancialData();
    data.incomeOccurrences.salary = {
      id: "salary", name: "Salario", incomeType: "salary", expectedAmountMinor: 100000,
      actualAmountMinor: 100000, currency: "DOP", expectedDate: "2026-08-15",
      receivedDate: "2026-08-15", financialMonth: "2026-08", quincena: 1,
      status: "received", oneTime: false, exportExpectedWhenPending: true, ...metadata,
    };
    const expenses: Expense[] = [{
      id: "daily", name: "Comida", unitPriceCents: 25000, quantity: 1,
      occurredDate: "2026-08-16", occurredAt: "2026-08-16T12:00:00.000Z",
      currency: "DOP", paymentMethod: "debit", status: "transferred",
      createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z",
    }];

    const report = calculateReportTotals(data, expenses, ["2026-08"], "all", "DOP");
    expect(report.dailyCashSpending).toBe(25000);
    expect(report.dailyCardSpending).toBe(0);
    expect(report.cashFlow).toBe(75000);
    expect(report.planning).toBe(75000);
  });

  it("tracks purpose-based savings, allocations and card coverage", () => {
    const data = createEmptyFinancialData();
    data.savingsFunds.annual = { id: "annual", name: "Anuales", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "annual", type: "deposit", amountMinor: 500000, currency: "DOP", transactionDate: "2026-08-15", ...metadata };
    data.savingsAllocations.reserve = { id: "reserve", fundId: "annual", obligationType: "nonMonthly", obligationId: "insurance-occ", amountMinor: 320000, currency: "DOP", active: true, ...metadata };
    data.creditCards.card = { id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-08-01", ...metadata };
    data.cardTransactions.insurance = { id: "insurance", cardId: "card", currency: "DOP", type: "charge", amountMinor: 320000, transactionDate: "2026-08-20", description: "Seguro", linkedExpenseId: "insurance-occ", ...metadata };
    expect(getFundBalance(data, "annual")).toBe(500000);
    expect(getFundAllocated(data, "annual")).toBe(320000);
    expect(getCardSavingsCoverage(data, "card", "DOP")).toBe(320000);
    expect(getCardSavingsCoverage(data, "card", "USD")).toBe(0);
  });

  it("filters monthly obligations by their planned quincena instead of the due-date quincena", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.internet = {
      id: "internet", name: "Internet", expectedAmountMinor: 150000, currency: "DOP",
      dueDate: "2026-09-05", financialMonth: "2026-08", quincena: 1,
      status: "upcoming", canPayWithCard: true, oneTime: false, ...metadata,
    };

    expect(calculateReportTotals(data, [], ["2026-08"], 1, "DOP").monthlyPending).toBe(150000);
    expect(calculateReportTotals(data, [], ["2026-08"], 2, "DOP").monthlyPending).toBe(0);
  });

  it("keeps cash-paid fixed bills in the period projection", () => {
    const data = createEmptyFinancialData();
    data.incomeOccurrences.salary = {
      id: "salary", name: "Salario", incomeType: "salary", expectedAmountMinor: 500000,
      actualAmountMinor: 500000, currency: "DOP", expectedDate: "2026-08-15",
      receivedDate: "2026-08-15", financialMonth: "2026-08", quincena: 1,
      status: "received", oneTime: false, exportExpectedWhenPending: true, ...metadata,
    };
    data.monthlyOccurrences.internet = {
      id: "internet", name: "Internet", expectedAmountMinor: 150000,
      actualAmountMinor: 150000, currency: "DOP", dueDate: "2026-08-15",
      financialMonth: "2026-08", quincena: 1, status: "paid", paymentId: "payment",
      canPayWithCard: true, oneTime: false, ...metadata,
    };
    data.payments.payment = {
      id: "payment", sourceType: "monthly", sourceId: "internet", amountMinor: 150000,
      currency: "DOP", paidDate: "2026-08-15", method: "cash", ...metadata,
    };
    const expenses: Expense[] = [{
      id: "daily", name: "Comida", unitPriceCents: 50000, quantity: 1,
      occurredDate: "2026-08-15", occurredAt: "2026-08-15T12:00:00.000Z",
      status: "transferred", createdAt: "2026-08-15T12:00:00.000Z",
      updatedAt: "2026-08-15T12:00:00.000Z",
    }];

    const report = calculateReportTotals(data, expenses, ["2026-08"], 1, "DOP");
    expect(report.planningIncome).toBe(500000);
    expect(report.planningCommitments).toBe(150000);
    expect(report.planning).toBe(300000);
  });

  it("subtracts only the planned card payment and never the complete statement", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 500000, openingCurrentDebtUsdMinor: 50000,
      openingStatementDopMinor: 500000, openingStatementUsdMinor: 50000,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardStatements.dop = {
      id: "dop", cardId: "card", currency: "DOP", cycleStartDate: "2026-07-21",
      cutDate: "2026-08-20", dueDate: "2026-09-05", statementAmountMinor: 500000,
      status: "open", ...metadata,
    };
    data.cardPaymentPlans["2026-08_Q1"] = {
      id: "2026-08_Q1", financialMonth: "2026-08", quincena: 1,
      plannedDopMinor: 50000, plannedUsdMinor: 10000, ...metadata,
    };
    data.cardTransactions.dopPayment = {
      id: "dopPayment", cardId: "card", currency: "DOP", type: "payment", amountMinor: 20000,
      transactionDate: "2026-08-18", description: "Pago DOP", ...metadata,
    };
    data.cardTransactions.usdPayment = {
      id: "usdPayment", cardId: "card", currency: "USD", type: "payment", amountMinor: 4000,
      settlementAmountDopMinor: 250000, transactionDate: "2026-08-19", description: "Pago USD", ...metadata,
    };

    const base = calculateReportTotals(data, [], ["2026-08"], 1, "DOP");
    const card = calculateCardPaymentProjection(data, ["2026-08"], 1, 60);
    expect(base.planningCommitments).toBe(0);
    expect(card.actualCashOutflowDopMinor).toBe(270000);
    expect(card.remainingPlannedDopMinor).toBe(30000);
    expect(card.remainingPlannedUsdMinor).toBe(6000);
    expect(card.estimatedRemainingUsdDopMinor).toBe(360000);
    expect(card.totalCashCommitmentDopMinor).toBe(660000);
  });

  it("tracks the exact statement minimum and uses it as the projection floor", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa Bravo", cutDay: 20, dueDay: 30, active: true,
      openingCurrentDebtDopMinor: 100000, openingCurrentDebtUsdMinor: 0,
      openingStatementDopMinor: 100000, openingStatementUsdMinor: 0,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardStatements.dop = {
      id: "dop", cardId: "card", currency: "DOP", cycleStartDate: "2026-07-21",
      cutDate: "2026-08-20", dueDate: "2026-08-30", statementAmountMinor: 100000,
      minimumPaymentMinor: 12000, status: "open", ...metadata,
    };
    data.cardTransactions.partial = {
      id: "partial", cardId: "card", currency: "DOP", type: "payment", amountMinor: 5000,
      transactionDate: "2026-08-25", description: "Abono", ...metadata,
    };
    data.cardPaymentPlans["2026-08_Q2"] = {
      id: "2026-08_Q2", financialMonth: "2026-08", quincena: 2,
      plannedDopMinor: 3000, plannedUsdMinor: 0, ...metadata,
    };

    const progress = getCardMinimumPaymentProgress(data, data.cardStatements.dop, "2026-08-25", 7);
    expect(progress).toMatchObject({ configured: true, paidMinor: 5000, remainingMinor: 7000, status: "dueSoon" });

    const projection = calculateCardPaymentProjection(data, ["2026-08"], "all", 60);
    expect(projection.minimumDueDopMinor).toBe(12000);
    expect(projection.minimumTopUpDopMinor).toBe(7000);
    expect(projection.totalCashCommitmentDopMinor).toBe(12000);

    data.cardTransactions.completed = {
      id: "completed", cardId: "card", currency: "DOP", type: "payment", amountMinor: 7000,
      transactionDate: "2026-08-30", description: "Completar mínimo", ...metadata,
    };
    expect(getCardMinimumPaymentProgress(data, data.cardStatements.dop, "2026-08-30", 7))
      .toMatchObject({ remainingMinor: 0, satisfiedDate: "2026-08-30", status: "paidOnTime" });
  });

  it("keeps undated purchase goals out of projections while reserving savings for them", () => {
    const data = createEmptyFinancialData();
    data.purchaseGoals.tv = {
      id: "tv", name: "Televisor", estimatedAmountMinor: 5000000, currency: "DOP",
      priority: "medium", status: "active", ...metadata,
    };
    data.savingsFunds.home = { id: "home", name: "Hogar", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "home", type: "deposit", amountMinor: 2000000, currency: "DOP", transactionDate: "2026-08-15", ...metadata };
    data.savingsAllocations.tv = { id: "tv", fundId: "home", obligationType: "purchaseGoal", obligationId: "tv", amountMinor: 2000000, currency: "DOP", active: true, ...metadata };

    expect(getPurchaseGoalReserved(data, "tv")).toBe(2000000);
    expect(getFundAllocated(data, "home")).toBe(2000000);
    expect(calculateReportTotals(data, [], ["2026-08"], "all", "DOP").planning).toBe(0);
  });

  it("uses a goal's reserved savings as coverage after the purchase moves to a card", () => {
    const data = createEmptyFinancialData();
    data.purchaseGoals.tv = {
      id: "tv", name: "Televisor", estimatedAmountMinor: 5000000, currency: "DOP",
      priority: "high", status: "purchased", purchaseMethod: "creditCard",
      linkedCardTransactionId: "charge", ...metadata,
    };
    data.savingsFunds.home = { id: "home", name: "Hogar", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "home", type: "deposit", amountMinor: 3000000, currency: "DOP", transactionDate: "2026-08-15", ...metadata };
    data.savingsAllocations.tv = { id: "tv", fundId: "home", obligationType: "purchaseGoal", obligationId: "tv", amountMinor: 3000000, currency: "DOP", active: true, ...metadata };
    data.creditCards.card = { id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-08-01", ...metadata };
    data.cardTransactions.charge = { id: "charge", cardId: "card", currency: "DOP", type: "charge", amountMinor: 5000000, transactionDate: "2026-08-20", description: "Televisor", linkedPurchaseGoalId: "tv", ...metadata };

    expect(getCardSavingsCoverage(data, "card", "DOP")).toBe(3000000);
  });
});
