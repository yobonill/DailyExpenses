import { describe, expect, it } from "vitest";
import type { Expense } from "../models/expense";
import { createEmptyFinancialData } from "./financialState";
import { buildSpendingHistory, getPreviousSpendingRange, getSpendingTotals } from "./spendingHistory";

const meta = { createdAt: "2026-09-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "u", version: 1 };

describe("spending history", () => {
  it("combines spending sources without counting linked card or fee movements twice", () => {
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
      "cardTransaction:manual", "payment:billPayment", "moneyTransaction:fee", "expense:food",
    ]);
    const totals = getSpendingTotals(entries);
    expect(totals.total).toEqual({ DOP: 3_025, USD: 1_000 });
    expect(totals.real.DOP).toBe(1_025);
    expect(totals.card).toEqual({ DOP: 2_000, USD: 1_000 });
    expect(entries[0].category).toBe("Otros");
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
