import { describe, expect, it } from "vitest";
import type { Expense } from "../models/expense";
import { createEmptyFinancialData } from "./financialState";
import { buildSpendingHistory, getPreviousSpendingRange, getReceivedIncomeTotals, getSpendingTotals, getSpendingTypeTotals } from "./spendingHistory";

const meta = { createdAt: "2026-09-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "u", version: 1 };

describe("spending history", () => {
  it("combines spending sources, includes historical payments, and avoids linked duplicates", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Bravo", cutDay: 15, dueDay: 10, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 0,
      openingDate: "2026-09-01", ...meta,
    };
    data.monthlyOccurrences.internet = {
      id: "internet", name: "Internet", category: "Servicios", expectedAmountMinor: 2_000,
      actualAmountMinor: 2_000, currency: "DOP", dueDate: "2026-09-05", financialMonth: "2026-08",
      quincena: 2, status: "paid", canPayWithCard: true, oneTime: false, paymentId: "billPayment", ...meta,
    };
    data.payments.billPayment = {
      id: "billPayment", sourceType: "monthly", sourceId: "internet", amountMinor: 2_000,
      currency: "DOP", paidDate: "2026-09-05", method: "creditCard", cardId: "card",
      cardTransactionId: "billCharge", ...meta,
    };
    data.cardTransactions.billCharge = {
      id: "billCharge", cardId: "card", currency: "DOP", type: "charge", amountMinor: 2_000,
      transactionDate: "2026-09-05", description: "Internet", linkedPaymentId: "billPayment", ...meta,
    };
    data.cardTransactions.manual = {
      id: "manual", cardId: "card", currency: "USD", type: "charge", amountMinor: 1_000,
      transactionDate: "2026-09-06", description: "Compra manual", category: "Otros", ...meta,
    };
    data.moneyTransactions.fee = {
      id: "fee", accountId: "bank", direction: "out", type: "fee", amountMinor: 25,
      currency: "DOP", transactionDate: "2026-09-04", description: "Comisión bancaria",
      linkedDailyExpenseId: "food", ...meta,
    };
    data.payments.historical = {
      id: "historical", sourceType: "monthly", sourceId: "internet", amountMinor: 9_999,
      currency: "DOP", paidDate: "2026-09-01", method: "cash", historical: true, ...meta,
    };
    const expenses: Expense[] = [{
      id: "food", name: "Almuerzo", unitPriceCents: 500, quantity: 2,
      occurredDate: "2026-09-04", occurredAt: "2026-09-04T12:00:00.000Z",
      category: "Alimentación", currency: "DOP", paymentMethod: "transfer",
      moneyAccountId: "bank", transferFeeCents: 25, status: "transferred",
      createdAt: "2026-09-04T12:00:00.000Z", updatedAt: "2026-09-04T12:00:00.000Z",
    }];

    const entries = buildSpendingHistory(data, expenses);
    expect(entries.map((entry) => entry.id)).toEqual([
      "cardTransaction:manual", "payment:billPayment", "moneyTransaction:fee", "expense:food", "payment:historical",
    ]);
    const totals = getSpendingTotals(entries);
    expect(totals.total).toEqual({ DOP: 13_024, USD: 1_000 });
    expect(totals.real.DOP).toBe(1_025);
    expect(totals.card).toEqual({ DOP: 2_000, USD: 1_000 });
    expect(totals.unclassified).toEqual({ DOP: 9_999, USD: 0 });
    expect(entries.at(-1)).toMatchObject({ id: "payment:historical", date: "2026-08-30", dateIsApproximate: true, method: "unclassified" });
    expect(entries[0].category).toBe("Otros");
    const byType = getSpendingTypeTotals(entries);
    expect(byType.monthly.DOP + byType.extra.DOP + byType.nonMonthly.DOP + byType.purchaseGoal.DOP).toBe(totals.total.DOP);
    expect(byType.monthly.USD + byType.extra.USD + byType.nonMonthly.USD + byType.purchaseGoal.USD).toBe(totals.total.USD);
  });

  it("uses the actual DOP cash outflow for a USD obligation settled from a bank", () => {
    const data = createEmptyFinancialData();
    data.nonMonthlyOccurrences.usd = {
      id: "usd", planId: "plan", name: "Licencia", category: "Servicios", expectedAmountMinor: 1_000,
      actualAmountMinor: 1_000, currency: "USD", dueDate: "2026-09-05", status: "paid",
      canPayWithCard: false, paymentId: "payment", ...meta,
    };
    data.payments.payment = {
      id: "payment", sourceType: "nonMonthly", sourceId: "usd", amountMinor: 1_000,
      settlementAmountDopMinor: 62_500, currency: "USD", paidDate: "2026-09-05",
      method: "bankTransfer", moneyAccountId: "bank", ...meta,
    };
    const [entry] = buildSpendingHistory(data, []);
    expect(entry).toMatchObject({ currency: "DOP", amountMinor: 62_500, originalCurrency: "USD", originalAmountMinor: 1_000 });
  });

  it("uses reporting-only historical methods, counts loan payments as spending, and keeps savings visible", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.service = {
      id: "service", name: "Internet", category: "Servicios", expectedAmountMinor: 1_000,
      actualAmountMinor: 1_000, currency: "DOP", dueDate: "2026-08-20", financialMonth: "2026-08",
      quincena: 1, status: "paid", canPayWithCard: true, oneTime: false, paymentId: "servicePayment", ...meta,
    };
    data.monthlyOccurrences.loan = {
      id: "loan", name: "Préstamo", category: "Deudas y préstamos", expectedAmountMinor: 2_000,
      actualAmountMinor: 2_000, currency: "DOP", dueDate: "2026-08-21", financialMonth: "2026-08",
      quincena: 1, status: "paid", canPayWithCard: false, oneTime: false, paymentId: "loanPayment", ...meta,
    };
    data.monthlyOccurrences.savings = {
      id: "savings", name: "Ahorrar", category: "Ahorros", expectedAmountMinor: 3_000,
      actualAmountMinor: 3_000, currency: "DOP", dueDate: "2026-08-22", financialMonth: "2026-08",
      quincena: 1, status: "paid", canPayWithCard: false, oneTime: false, paymentId: "savingsPayment", ...meta,
    };
    data.payments.servicePayment = {
      id: "servicePayment", sourceType: "monthly", sourceId: "service", amountMinor: 1_000,
      currency: "DOP", paidDate: "2026-09-02", method: "cash", historical: true,
      reportingMethod: "bankTransfer", reportingMoneyAccountId: "bank", ...meta,
    };
    data.payments.loanPayment = {
      id: "loanPayment", sourceType: "monthly", sourceId: "loan", amountMinor: 2_000,
      currency: "DOP", paidDate: "2026-09-02", method: "cash", historical: true, ...meta,
    };
    data.payments.savingsPayment = {
      id: "savingsPayment", sourceType: "monthly", sourceId: "savings", amountMinor: 3_000,
      currency: "DOP", paidDate: "2026-09-02", method: "cash", historical: true, ...meta,
    };

    const entries = buildSpendingHistory(data, []);
    const totals = getSpendingTotals(entries);
    expect(entries.find((entry) => entry.sourceId === "servicePayment")).toMatchObject({ method: "bank", date: "2026-08-15", dateIsApproximate: true });
    expect(totals.total.DOP).toBe(3_000);
    expect(totals.real.DOP).toBe(1_000);
    expect(totals.unclassified.DOP).toBe(2_000);
    expect(totals.savings.DOP).toBe(3_000);
  });

  it("includes new savings deposits as money destined without treating opening balances as current savings", () => {
    const data = createEmptyFinancialData();
    data.savingsFunds.emergency = {
      id: "emergency", name: "Emergencias", currency: "DOP", active: true, moneyAccountId: "bank", ...meta,
    };
    data.savingsTransactions.opening = {
      id: "opening", fundId: "emergency", type: "deposit", amountMinor: 50_000,
      currency: "DOP", transactionDate: "2026-09-01", notes: "Saldo inicial", ...meta,
    };
    data.savingsTransactions.deposit = {
      id: "deposit", fundId: "emergency", type: "deposit", amountMinor: 2_500,
      currency: "DOP", transactionDate: "2026-09-05", ...meta,
    };

    const entries = buildSpendingHistory(data, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "savingsTransaction", nature: "savings", amountMinor: 2_500, method: "unclassified" });
    const totals = getSpendingTotals(entries);
    expect(totals.savings.DOP).toBe(2_500);
    expect(totals.total.DOP).toBe(0);
  });

  it("shows a planned savings payment once when its fund deposit is linked", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.savings = {
      id: "savings", name: "Ahorrar", category: "Ahorros", expectedAmountMinor: 2_000,
      actualAmountMinor: 2_000, currency: "DOP", dueDate: "2026-09-05", financialMonth: "2026-08",
      quincena: 2, status: "paid", canPayWithCard: false, oneTime: false, paymentId: "savingsPayment", ...meta,
    };
    data.payments.savingsPayment = {
      id: "savingsPayment", sourceType: "monthly", sourceId: "savings", amountMinor: 2_000,
      currency: "DOP", paidDate: "2026-09-05", method: "bankTransfer", moneyAccountId: "bank",
      savingsTransactionIds: ["savingsDeposit"], ...meta,
    };
    data.savingsTransactions.savingsDeposit = {
      id: "savingsDeposit", fundId: "fund", type: "deposit", amountMinor: 2_000, currency: "DOP",
      transactionDate: "2026-09-05", linkedPaymentId: "savingsPayment", ...meta,
    };

    const entries = buildSpendingHistory(data, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "payment:savingsPayment", nature: "savings", amountMinor: 2_000 });
    expect(getSpendingTotals(entries).savings.DOP).toBe(2_000);
  });

  it("counts the complete loan payment inside spending", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.loan = {
      id: "loan", name: "Cuota préstamo", category: "Deudas y préstamos", expectedAmountMinor: 12_000,
      actualAmountMinor: 12_000, currency: "DOP", dueDate: "2026-09-03", financialMonth: "2026-08",
      quincena: 2, status: "paid", canPayWithCard: false, oneTime: false, paymentId: "loanPayment", loanId: "loanAccount", ...meta,
    };
    data.payments.loanPayment = {
      id: "loanPayment", sourceType: "monthly", sourceId: "loan", amountMinor: 12_000,
      currency: "DOP", paidDate: "2026-09-03", method: "bankTransfer", moneyAccountId: "bank",
      loanId: "loanAccount", loanTransactionId: "loanTransaction", ...meta,
    };
    data.loanTransactions.loanTransaction = {
      id: "loanTransaction", loanId: "loanAccount", type: "payment", transactionDate: "2026-09-03",
      totalPaymentMinor: 12_000, principalMinor: 9_000, interestMinor: 2_500, chargesMinor: 500,
      balanceBeforeMinor: 100_000, balanceAfterMinor: 91_000, linkedPaymentId: "loanPayment", ...meta,
    };

    const entries = buildSpendingHistory(data, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ nature: "expense", amountMinor: 12_000, spendingType: "monthly" });
    const totals = getSpendingTotals(entries);
    expect(totals.total.DOP).toBe(12_000);
    expect(getSpendingTypeTotals(entries).monthly.DOP).toBe(12_000);
  });

  it("uses financial periods for cycle income and receipt dates for literal ranges", () => {
    const data = createEmptyFinancialData();
    data.incomeOccurrences.salary = {
      id: "salary", name: "Nómina", incomeType: "salary", expectedAmountMinor: 30_000,
      actualAmountMinor: 32_000, currency: "DOP", expectedDate: "2026-08-15", receivedDate: "2026-08-14",
      financialMonth: "2026-08", quincena: 1, status: "received", oneTime: false, exportExpectedWhenPending: true, ...meta,
    };
    const q1 = { startDateKey: "2026-08-15", endDateKey: "2026-08-29" };
    expect(getReceivedIncomeTotals(data, q1, true).DOP).toBe(32_000);
    expect(getReceivedIncomeTotals(data, q1, false).DOP).toBe(0);
    expect(getReceivedIncomeTotals(data, { startDateKey: "2026-08-14", endDateKey: "2026-08-14" }, false).DOP).toBe(32_000);
  });

  it("compares a financial quincena and custom range with the immediately preceding period", () => {
    expect(getPreviousSpendingRange(
      { startDateKey: "2026-09-15", endDateKey: "2026-09-29" },
      "cycle",
    )).toEqual({ startDateKey: "2026-08-30", endDateKey: "2026-09-14" });
    expect(getPreviousSpendingRange(
      { startDateKey: "2026-09-03", endDateKey: "2026-09-10" },
      "custom",
    )).toEqual({ startDateKey: "2026-08-26", endDateKey: "2026-09-02" });
  });
});
