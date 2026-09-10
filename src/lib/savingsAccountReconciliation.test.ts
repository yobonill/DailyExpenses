import { describe, expect, it } from "vitest";
import { applyFinancialUpdates, createEmptyFinancialData } from "./financialState";
import { isFinanciallyConsistent, reconcileVersionedUpdates } from "./financialIntegrity";
import {
  getAccountAvailableUnreserved,
  getAccountReservedSavings,
  getMoneyAccountSpendableBalance,
  hasUnifiedSavingsAccounts,
} from "./moneyLedger";
import {
  SAVINGS_ACCOUNT_RECONCILIATION_ID,
  buildSavingsAccountReconciliationUpdates,
  previewSavingsAccountReconciliation,
} from "./savingsAccountReconciliation";

const metadata = {
  createdAt: "2026-09-09T00:00:00.000Z",
  createdBy: "user",
  updatedAt: "2026-09-09T00:00:00.000Z",
  updatedBy: "user",
  version: 1,
};

const buildScenario = () => {
  const data = createEmptyFinancialData();
  data.lastBackupAt = "2026-09-10T00:59:46.492Z";
  data.banks.bhd = { id: "bhd", name: "BHD", active: true, ...metadata };
  data.banks.scotia = { id: "scotia", name: "Scotiabank", active: true, ...metadata };
  data.banks.popular = { id: "popular", name: "Popular", active: true, ...metadata };
  data.moneyAccounts.alcanza = { id: "alcanza", kind: "bank", bankId: "bhd", accountType: "savings", name: "Alcanza", currency: "DOP", openingBalanceMinor: 0, openingDate: "2026-09-09", active: true, ...metadata };
  data.moneyAccounts.usd = { id: "usd", kind: "bank", bankId: "scotia", accountType: "savings", name: "Ahorros USD", currency: "USD", openingBalanceMinor: 0, openingDate: "2026-09-09", active: true, ...metadata };
  data.moneyAccounts.payroll = { id: "payroll", kind: "bank", bankId: "popular", accountType: "payroll", name: "Nómina", currency: "DOP", openingBalanceMinor: 245_301, openingDate: "2026-09-09", active: true, ...metadata };
  data.savingsFunds.home = { id: "home", name: "Nuevo hogar", currency: "DOP", active: false, moneyAccountId: "alcanza", ...metadata };
  data.savingsFunds.emergency = { id: "emergency", name: "Emergencias", currency: "DOP", active: false, moneyAccountId: "alcanza", ...metadata };
  data.savingsFunds.games = { id: "games", name: "Juegos", currency: "USD", active: false, moneyAccountId: "usd", ...metadata };
  data.savingsTransactions.homeOpening = { id: "homeOpening", fundId: "home", type: "deposit", amountMinor: 2_455_498, currency: "DOP", transactionDate: "2026-09-03", ...metadata };
  data.savingsTransactions.emergencyOpening = { id: "emergencyOpening", fundId: "emergency", type: "deposit", amountMinor: 2_600_000, currency: "DOP", transactionDate: "2026-09-03", ...metadata };
  data.savingsTransactions.gamesOpening = { id: "gamesOpening", fundId: "games", type: "deposit", amountMinor: 51_000, currency: "USD", transactionDate: "2026-09-03", ...metadata };
  return data;
};

describe("savings account reconciliation", () => {
  it("stops when a real account total is below its linked funds", () => {
    const data = buildScenario();
    const preview = previewSavingsAccountReconciliation(data, {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 0, usd: 0, payroll: 245_301 },
    });
    expect(preview.errors).toEqual([
      "El saldo total de Alcanza no puede ser menor que sus ahorros apartados.",
      "El saldo total de Ahorros USD no puede ser menor que sus ahorros apartados.",
    ]);
  });

  it("requires every positive fund to have a compatible physical account", () => {
    const data = buildScenario();
    delete data.savingsFunds.home.moneyAccountId;
    const preview = previewSavingsAccountReconciliation(data, {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 2_600_000, usd: 51_000, payroll: 245_301 },
    });
    expect(preview.errors).toContain("Vincula el fondo Nuevo hogar a una cuenta de la misma moneda antes de reconciliar.");
  });

  it("turns existing funds into reserved portions without changing their ledgers", () => {
    const data = buildScenario();
    const originalSavings = JSON.stringify({ funds: data.savingsFunds, transactions: data.savingsTransactions });
    const updates = buildSavingsAccountReconciliationUpdates(data, {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 5_500_000, usd: 51_000, payroll: 245_301 },
    }, "user", "2026-09-10T02:00:00.000Z");
    const reconciled = applyFinancialUpdates(data, updates);

    expect(getAccountReservedSavings(reconciled, "alcanza")).toBe(5_055_498);
    expect(getAccountAvailableUnreserved(reconciled, "alcanza")).toBe(444_502);
    expect(getAccountReservedSavings(reconciled, "usd")).toBe(51_000);
    expect(getAccountAvailableUnreserved(reconciled, "usd")).toBe(0);
    expect(getMoneyAccountSpendableBalance(reconciled, "payroll")).toBe(245_301);
    expect(hasUnifiedSavingsAccounts(reconciled)).toBe(true);
    expect(JSON.stringify({ funds: reconciled.savingsFunds, transactions: reconciled.savingsTransactions })).toBe(originalSavings);
    expect(reconciled.moneyTransactions["savings-reconciliation-alcanza"].amountMinor).toBe(5_500_000);
    expect(reconciled.moneyTransactions["savings-reconciliation-usd"].amountMinor).toBe(51_000);
    expect(reconciled.moneyTransactions["savings-reconciliation-payroll"]).toBeUndefined();
    expect(isFinanciallyConsistent(reconciled)).toBe(true);
  });

  it("is one-time and keeps a traceable summary", () => {
    const data = buildScenario();
    const input = {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 5_055_498, usd: 51_000, payroll: 245_301 },
    };
    const reconciled = applyFinancialUpdates(data, buildSavingsAccountReconciliationUpdates(data, input, "user"));
    const summary = reconciled.savingsAccountReconciliations[SAVINGS_ACCOUNT_RECONCILIATION_ID];
    expect(summary.baselineBackupAt).toBe(data.lastBackupAt);
    expect(summary.accounts.alcanza.availableUnreservedMinor).toBe(0);
    expect(() => buildSavingsAccountReconciliationUpdates(reconciled, input, "user")).toThrow("ya fue realizada");
  });

  it("rejects the complete operation when another device already reconciled", () => {
    const data = buildScenario();
    const firstInput = {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 5_055_498, usd: 51_000, payroll: 245_301 },
    };
    const competingInput = {
      transactionDate: "2026-09-10",
      actualBalancesMinor: { alcanza: 5_500_000, usd: 60_000, payroll: 300_000 },
    };
    const current = applyFinancialUpdates(data, buildSavingsAccountReconciliationUpdates(data, firstInput, "user-a"));
    const queuedFromSecondDevice = buildSavingsAccountReconciliationUpdates(data, competingInput, "user-b");
    const reconciled = reconcileVersionedUpdates(current, queuedFromSecondDevice);
    expect(reconciled).toEqual({ updates: {}, conflict: true });
  });
});
