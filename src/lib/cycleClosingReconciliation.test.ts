import { describe, expect, it } from "vitest";
import { createEmptyFinancialData, applyFinancialUpdates } from "./financialState";
import { balancesAt, buildClosing, closingNeedsReview, reviewMeta } from "./financialReview";
import { buildClosingReconciliationUpdates, previewClosingReconciliation } from "./cycleClosingReconciliation";
import { prepareReviewedUpdates } from "./reviewedUpdates";
import type { FinancialData } from "../models/finance";

const actor = "tester";
const metadata = reviewMeta(actor);

const accountFixture = (): FinancialData => {
  const data = createEmptyFinancialData();
  data.moneyAccounts.cash = {
    id: "cash", kind: "cash", name: "Efectivo", currency: "DOP",
    openingBalanceMinor: 10_000, openingDate: "2026-09-15", active: true, ...metadata,
  };
  return data;
};

describe("cycle closing reconciliation", () => {
  it("backfills a saved close at its cutoff and preserves every later movement", () => {
    const data = accountFixture();
    const closing = buildClosing(data, "2026-09", 1, { "account:cash": 15_000 }, "", actor);
    data.cycleClosings[closing.id] = closing;
    data.moneyTransactions.after = {
      id: "after", accountId: "cash", direction: "out", type: "expense", amountMinor: 2_000,
      currency: "DOP", transactionDate: "2026-09-30", description: "Movimiento posterior", ...metadata,
    };

    const preview = previewClosingReconciliation(data, closing);
    expect(preview.errors).toEqual([]);
    expect(preview.adjustments).toHaveLength(1);
    expect(preview.adjustments[0].deltaMinor).toBe(5_000);

    let confirmationCount = 0;
    const reviewed = prepareReviewedUpdates(data, buildClosingReconciliationUpdates(data, closing, actor), actor, {
      warn: () => undefined,
      confirm: () => { confirmationCount += 1; return true; },
    });
    expect(confirmationCount).toBe(0);

    const result = applyFinancialUpdates(data, reviewed);
    expect(balancesAt(result, "2026-09-29").find((item) => item.key === "account:cash")?.calculatedMinor).toBe(15_000);
    expect(balancesAt(result, "2026-09-30").find((item) => item.key === "account:cash")?.calculatedMinor).toBe(13_000);
    expect(result.moneyTransactions.after.amountMinor).toBe(2_000);
    expect(result.cycleClosings[closing.id].reconciledAt).toBeTruthy();
    expect(result.cycleClosings[closing.id].reconciliationTransactionIds).toHaveLength(1);
    expect(closingNeedsReview(result, result.cycleClosings[closing.id])).toBe(false);
    expect(() => buildClosingReconciliationUpdates(result, result.cycleClosings[closing.id], actor)).toThrow(/ya fue reconciliado/i);
  });

  it("reconciles credit-card debt independently without changing equal ledgers", () => {
    const data = accountFixture();
    data.creditCards.card = {
      id: "card", name: "Tarjeta", cutDay: 15, dueDay: 12, active: true, openingDate: "2026-09-15",
      openingCurrentDebtDopMinor: 10_000, openingCurrentDebtUsdMinor: 500,
      openingStatementDopMinor: 10_000, openingStatementUsdMinor: 500, ...metadata,
    };
    const closing = buildClosing(data, "2026-09", 1, {
      "account:cash": 10_000,
      "card:card:DOP": 8_000,
      "card:card:USD": 500,
    }, "", actor);
    const result = applyFinancialUpdates(data, buildClosingReconciliationUpdates(data, closing, actor));
    expect(balancesAt(result, "2026-09-29").find((item) => item.key === "card:card:DOP")?.calculatedMinor).toBe(8_000);
    expect(balancesAt(result, "2026-09-29").find((item) => item.key === "card:card:USD")?.calculatedMinor).toBe(500);
    const adjustments = Object.values(result.cardTransactions).filter((item) => item.closingReconciliationId === closing.id);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].amountMinor).toBe(-2_000);
  });

  it("refuses an old close if its cutoff history changed after it was saved", () => {
    const data = accountFixture();
    const closing = buildClosing(data, "2026-09", 1, { "account:cash": 15_000 }, "", actor);
    data.cycleClosings[closing.id] = closing;
    data.moneyTransactions.lateCorrection = {
      id: "lateCorrection", accountId: "cash", direction: "in", type: "adjustment", amountMinor: 100,
      currency: "DOP", transactionDate: "2026-09-20", description: "Corrección posterior", ...metadata,
    };
    const preview = previewClosingReconciliation(data, closing);
    expect(preview.errors.join(" ")).toMatch(/no coincide con el cálculo guardado/i);
    expect(() => buildClosingReconciliationUpdates(data, closing, actor)).toThrow();
  });
});
