import type {
  FinancialData,
  MoneyAccount,
  MoneyAccountId,
  MoneyTransaction,
  SavingsAccountReconciliation,
  SavingsAccountReconciliationEntry,
} from "../models/finance";
import { getFundBalance } from "./financialCalculations";
import {
  CASH_ACCOUNT_ID,
  LEGACY_BANK_ACCOUNT_ID,
  getAccountReservedSavings,
  getMoneyAccountBalance,
} from "./moneyLedger";

export const SAVINGS_ACCOUNT_RECONCILIATION_ID = "savingsAccountsV1";

export interface SavingsAccountReconciliationInput {
  transactionDate: string;
  actualBalancesMinor: Record<MoneyAccountId, number>;
}

export interface SavingsAccountReconciliationPreview {
  entries: SavingsAccountReconciliationEntry[];
  errors: string[];
}

export const getSavingsReconciliationAccounts = (data: FinancialData): MoneyAccount[] =>
  Object.values(data.moneyAccounts)
    .filter((account) => account.id !== LEGACY_BANK_ACCOUNT_ID
      && (!account.archivedAt || getAccountReservedSavings(data, account.id) > 0)
      && (account.kind === "bank"
        || (account.id === CASH_ACCOUNT_ID && getAccountReservedSavings(data, account.id) > 0)))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "bank" ? -1 : 1;
      const bankA = a.bankId ? data.banks[a.bankId]?.name || "" : "";
      const bankB = b.bankId ? data.banks[b.bankId]?.name || "" : "";
      return bankA.localeCompare(bankB, "es") || a.name.localeCompare(b.name, "es");
    });

export const previewSavingsAccountReconciliation = (
  data: FinancialData,
  input: SavingsAccountReconciliationInput,
): SavingsAccountReconciliationPreview => {
  const errors: string[] = [];
  const accounts = getSavingsReconciliationAccounts(data);
  if (!accounts.length) errors.push("No hay cuentas que reconciliar.");
  Object.values(data.savingsFunds)
    .filter((fund) => !fund.archivedAt && getFundBalance(data, fund.id) > 0)
    .forEach((fund) => {
      const account = fund.moneyAccountId ? data.moneyAccounts[fund.moneyAccountId] : undefined;
      if (!account || account.currency !== fund.currency) {
        errors.push(`Vincula el fondo ${fund.name} a una cuenta de la misma moneda antes de reconciliar.`);
      }
    });

  const entries = accounts.map((account): SavingsAccountReconciliationEntry => {
    const rawActual = input.actualBalancesMinor[account.id];
    const actualBalanceMinor = Number.isFinite(rawActual) ? Math.round(rawActual) : Number.NaN;
    const balanceBeforeMinor = getMoneyAccountBalance(data, account.id);
    const reservedSavingsMinor = getAccountReservedSavings(data, account.id);
    if (!Number.isFinite(actualBalanceMinor) || actualBalanceMinor < 0) {
      errors.push(`Indica el saldo total actual de ${account.name}.`);
    } else if (actualBalanceMinor < reservedSavingsMinor) {
      errors.push(`El saldo total de ${account.name} no puede ser menor que sus ahorros apartados.`);
    }
    return {
      accountId: account.id,
      currency: account.currency,
      balanceBeforeMinor,
      actualBalanceMinor,
      reservedSavingsMinor,
      availableUnreservedMinor: actualBalanceMinor - reservedSavingsMinor,
      adjustmentMinor: actualBalanceMinor - balanceBeforeMinor,
    };
  });

  return { entries, errors };
};

export const buildSavingsAccountReconciliationUpdates = (
  data: FinancialData,
  input: SavingsAccountReconciliationInput,
  actor: string,
  completedAt = new Date().toISOString(),
): Record<string, unknown> => {
  if (data.savingsAccountReconciliations[SAVINGS_ACCOUNT_RECONCILIATION_ID]) {
    throw new Error("La unificación de cuentas y ahorros ya fue realizada.");
  }
  if (!data.lastBackupAt) {
    throw new Error("Descarga primero un respaldo JSON actualizado desde Configuración.");
  }
  const preview = previewSavingsAccountReconciliation(data, input);
  if (preview.errors.length) throw new Error(preview.errors[0]);

  const entryMap: Record<MoneyAccountId, SavingsAccountReconciliationEntry> = {};
  const updates: Record<string, unknown> = {};
  for (const entry of preview.entries) {
    const account = data.moneyAccounts[entry.accountId];
    const transactionId = entry.adjustmentMinor === 0
      ? undefined
      : `savings-reconciliation-${entry.accountId}`;
    entryMap[entry.accountId] = { ...entry, moneyTransactionId: transactionId };
    if (!transactionId) continue;
    updates[`moneyTransactions/${transactionId}`] = {
      id: transactionId,
      accountId: entry.accountId,
      direction: entry.adjustmentMinor > 0 ? "in" : "out",
      type: "adjustment",
      amountMinor: Math.abs(entry.adjustmentMinor),
      currency: entry.currency,
      transactionDate: input.transactionDate,
      description: `Unificación de cuenta y ahorros · ${account.name}`,
      notes: "Saldo total confirmado; los fondos vinculados pasan a ser porciones apartadas, sin sumarse nuevamente.",
      createdAt: completedAt,
      createdBy: actor,
      updatedAt: completedAt,
      updatedBy: actor,
      version: 1,
    } satisfies MoneyTransaction;
  }

  const reconciliation: SavingsAccountReconciliation = {
    id: SAVINGS_ACCOUNT_RECONCILIATION_ID,
    status: "completed",
    transactionDate: input.transactionDate,
    baselineBackupAt: data.lastBackupAt,
    accounts: entryMap,
    createdAt: completedAt,
    createdBy: actor,
    updatedAt: completedAt,
    updatedBy: actor,
    version: 1,
  };
  updates[`savingsAccountReconciliations/${SAVINGS_ACCOUNT_RECONCILIATION_ID}`] = reconciliation;
  return updates;
};
