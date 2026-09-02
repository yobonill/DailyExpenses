import { describe, expect, it } from "vitest";
import type { Expense } from "../models/expense";
import { createEmptyFinancialData } from "./financialState";
import {
  calculateReportTotals,
  getCardCurrentDebt,
  getCardDebtAtDate,
  getCardSavingsCoverage,
  getFundAllocated,
  getFundBalance,
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
    const expenses: Expense[] = [{
      id: "daily", name: "Cena", unitPriceCents: 20000, quantity: 1,
      occurredDate: "2026-08-16", occurredAt: "2026-08-16T12:00:00.000Z", status: "transferred",
      createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z",
    }];
    expect(getCardCurrentDebt(data, "card", "DOP")).toBe(45000);
    expect(getCardCurrentDebt(data, "card", "USD")).toBe(1500);
    expect(getCardDebtAtDate(data, "card", "DOP", "2026-08-16")).toBe(30000);
    const report = calculateReportTotals(data, expenses, ["2026-08"], "all", "DOP");
    expect(report.dailySpending).toBe(20000);
    expect(report.spending).toBe(50000);
    expect(report.cardPayments).toBe(15000);
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
});
