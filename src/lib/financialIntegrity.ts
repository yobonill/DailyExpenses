import type { FinancialData, RecordMetadata } from "../models/finance";
import { getCardCurrentDebt, getFundAllocated, getFundBalance, getPurchaseGoalReserved } from "./financialCalculations";
import { getLoanBalance } from "./loanLedger";
import { CASH_ACCOUNT_ID, LEGACY_BANK_ACCOUNT_ID, getAccountReservedSavings, getMoneyAccountBalance, hasUnifiedSavingsAccounts } from "./moneyLedger";

const getAtPath = (target: unknown, path: string): unknown => {
  let cursor = target;
  for (const part of path.split("/").filter(Boolean)) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const recordVersion = (value: unknown): number | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const version = (value as Partial<RecordMetadata>).version;
  return typeof version === "number" ? version : undefined;
};

export const reconcileVersionedUpdates = (
  current: FinancialData,
  requested: Record<string, unknown>,
): { updates: Record<string, unknown>; conflict: boolean } => {
  const updates: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(requested)) {
    const incomingVersion = recordVersion(value);
    const currentVersion = recordVersion(getAtPath(current, path));
    if (incomingVersion !== undefined && currentVersion !== undefined) {
      if (path.startsWith("savingsAccountReconciliations/")) {
        // The reconciliation marker guards its complete multi-path operation.
        // If another device already created it, none of this queued operation may run.
        return { updates: {}, conflict: true };
      }
      if (incomingVersion === 1 && currentVersion >= 1) continue;
      if (incomingVersion !== currentVersion + 1) return { updates: {}, conflict: true };
    }
    updates[path] = value;
  }
  return { updates, conflict: false };
};

export const isFinanciallyConsistent = (candidate: FinancialData): boolean => {
  for (const [bankId, bank] of Object.entries(candidate.banks)) {
    if (bank.id !== bankId || !bank.name.trim() || typeof bank.active !== "boolean") return false;
  }
  const activePaymentKeys = new Set<string>();
  for (const payment of Object.values(candidate.payments)) {
    if (payment.reversedAt) continue;
    if (payment.historical) {
      if (!payment.historicalSource
        || !["unknown", "creditCardOpeningBalance", "cashOrBankBeforeTracking"].includes(payment.historicalSource)
        || payment.cardTransactionId
        || payment.moneyTransactionId
        || payment.feeMoneyTransactionId
        || payment.loanTransactionId
        || (payment.savingsTransactionIds && payment.savingsTransactionIds.length > 0)) return false;
      if (payment.historicalSource === "creditCardOpeningBalance"
        && (payment.method !== "creditCard" || !payment.cardId || !candidate.creditCards[payment.cardId])) return false;
      if (payment.reportingMethod && !["cash", "bankTransfer", "debitCard", "creditCard"].includes(payment.reportingMethod)) return false;
      if (payment.reportingMethod === "creditCard" && (!payment.reportingCardId || !candidate.creditCards[payment.reportingCardId])) return false;
      if (payment.reportingMethod && payment.reportingMethod !== "creditCard"
        && (!payment.reportingMoneyAccountId || !candidate.moneyAccounts[payment.reportingMoneyAccountId])) return false;
    } else if (payment.historicalSource || payment.reportingMethod || payment.reportingMoneyAccountId || payment.reportingCardId || payment.reportingClassifiedAt) return false;
    const key = `${payment.sourceType}:${payment.sourceId}`;
    if (activePaymentKeys.has(key)) return false;
    activePaymentKeys.add(key);
  }
  for (const [accountId, account] of Object.entries(candidate.moneyAccounts)) {
    const isCash = accountId === CASH_ACCOUNT_ID;
    const isLegacy = accountId === LEGACY_BANK_ACCOUNT_ID;
    const bank = account.bankId ? candidate.banks[account.bankId] : undefined;
    if (account.id !== accountId
      || (isCash ? account.kind !== "cash" : account.kind !== "bank")
      || (!isCash && !isLegacy && (!bank || !account.accountType))
      || (isCash && Boolean(account.bankId))
      || !["DOP", "USD"].includes(account.currency)
      || ((isCash || isLegacy) && account.currency !== "DOP")
      || account.openingBalanceMinor < 0
      || getMoneyAccountBalance(candidate, account.id) < 0) return false;
    if (hasUnifiedSavingsAccounts(candidate)
      && account.id !== LEGACY_BANK_ACCOUNT_ID
      && getAccountReservedSavings(candidate, account.id) > getMoneyAccountBalance(candidate, account.id)) return false;
  }
  for (const transaction of Object.values(candidate.moneyTransactions)) {
    const account = candidate.moneyAccounts[transaction.accountId];
    if (!account
      || transaction.currency !== account.currency
      || transaction.amountMinor <= 0
      || !["in", "out"].includes(transaction.direction)) return false;
  }
  for (const loan of Object.values(candidate.loans)) {
    if (!loan.name || loan.openingBalanceMinor < 0 || loan.annualInterestRate < 0 || getLoanBalance(candidate, loan.id) < 0
      || (loan.bankId && !candidate.banks[loan.bankId])) return false;
  }
  for (const transaction of Object.values(candidate.loanTransactions)) {
    const loan = candidate.loans[transaction.loanId];
    if (!loan || transaction.balanceBeforeMinor < 0 || transaction.balanceAfterMinor < 0) return false;
    if (transaction.type === "payment") {
      const principal = transaction.principalMinor || 0;
      const interest = transaction.interestMinor || 0;
      const charges = transaction.chargesMinor || 0;
      if (!transaction.linkedPaymentId || !candidate.payments[transaction.linkedPaymentId]
        || principal < 0 || interest < 0 || charges < 0
        || principal + interest + charges !== transaction.totalPaymentMinor
        || transaction.balanceAfterMinor !== Math.max(0, transaction.balanceBeforeMinor - principal)) return false;
    } else if (!transaction.adjustmentMinor
      || transaction.balanceAfterMinor !== transaction.balanceBeforeMinor + transaction.adjustmentMinor) return false;
  }
  for (const fundId of Object.keys(candidate.savingsFunds)) {
    const fund = candidate.savingsFunds[fundId];
    const account = fund.moneyAccountId ? candidate.moneyAccounts[fund.moneyAccountId] : undefined;
    if (fund.moneyAccountId && (!account || account.currency !== fund.currency)) return false;
    const balance = getFundBalance(candidate, fundId);
    if (balance < 0 || getFundAllocated(candidate, fundId) > balance) return false;
  }
  for (const [reconciliationId, reconciliation] of Object.entries(candidate.savingsAccountReconciliations)) {
    if (reconciliation.id !== reconciliationId
      || reconciliation.status !== "completed"
      || !reconciliation.transactionDate
      || !reconciliation.createdAt) return false;
    for (const [accountId, entry] of Object.entries(reconciliation.accounts)) {
      if (entry.accountId !== accountId
        || !candidate.moneyAccounts[accountId]
        || entry.actualBalanceMinor < 0
        || entry.reservedSavingsMinor < 0
        || entry.availableUnreservedMinor !== entry.actualBalanceMinor - entry.reservedSavingsMinor
        || entry.availableUnreservedMinor < 0
        || entry.adjustmentMinor !== entry.actualBalanceMinor - entry.balanceBeforeMinor) return false;
    }
  }
  for (const transaction of Object.values(candidate.cardTransactions)) {
    if (transaction.affectsCurrentBalance !== undefined
      && typeof transaction.affectsCurrentBalance !== "boolean") return false;
    if (transaction.settlementAmountDopMinor !== undefined
      && (transaction.type !== "payment"
        || transaction.currency !== "USD"
        || transaction.amountMinor <= 0
        || transaction.settlementAmountDopMinor <= 0)) return false;
    if (transaction.linkedPurchaseGoalId) {
      const goal = candidate.purchaseGoals[transaction.linkedPurchaseGoalId];
      if (!goal || goal.currency !== transaction.currency) return false;
    }
    if (transaction.moneyAccountId && !candidate.moneyAccounts[transaction.moneyAccountId]) return false;
  }
  for (const [cardId, card] of Object.entries(candidate.creditCards)) {
    if (card.bankId && !candidate.banks[card.bankId]) return false;
    if (getCardCurrentDebt(candidate, cardId, "DOP") < 0
      || getCardCurrentDebt(candidate, cardId, "USD") < 0) return false;
  }
  for (const income of Object.values(candidate.incomeOccurrences)) {
    const account = income.moneyAccountId ? candidate.moneyAccounts[income.moneyAccountId] : undefined;
    if (income.moneyAccountId && (!account || account.currency !== income.currency)) return false;
  }
  for (const statement of Object.values(candidate.cardStatements)) {
    if (statement.minimumPaymentMinor !== undefined && statement.minimumPaymentMinor <= 0) return false;
  }
  for (const plan of Object.values(candidate.cardPaymentPlans)) {
    if (!/^\d{4}-\d{2}$/.test(plan.financialMonth)
      || (plan.quincena !== 1 && plan.quincena !== 2)
      || plan.plannedDopMinor < 0
      || plan.plannedUsdMinor < 0) return false;
  }
  for (const allocation of Object.values(candidate.savingsAllocations)) {
    if (!allocation.active || allocation.releasedAt || allocation.consumedAt) continue;
    const fund = candidate.savingsFunds[allocation.fundId];
    if (!fund || fund.currency !== allocation.currency) return false;
    if (allocation.obligationType === "nonMonthly") {
      const obligation = candidate.nonMonthlyOccurrences[allocation.obligationId];
      if (!obligation || obligation.currency !== allocation.currency) return false;
    } else if (allocation.obligationType === "cardStatement") {
      const statement = candidate.cardStatements[allocation.obligationId];
      if (!statement || statement.currency !== allocation.currency) return false;
    } else {
      const goal = candidate.purchaseGoals[allocation.obligationId];
      if (!goal || goal.currency !== allocation.currency || goal.status === "discarded") return false;
    }
  }
  for (const goal of Object.values(candidate.purchaseGoals)) {
    if (goal.estimatedAmountMinor <= 0) return false;
    const reserved = getPurchaseGoalReserved(candidate, goal.id);
    if (reserved > goal.estimatedAmountMinor) return false;
    if (reserved > 0 && (goal.status === "scheduled"
      || goal.status === "discarded"
      || (goal.status === "purchased" && goal.purchaseMethod !== "creditCard"))) return false;
    if (goal.status === "scheduled" && (!goal.scheduledOccurrenceId || !candidate.nonMonthlyOccurrences[goal.scheduledOccurrenceId])) return false;
    if (goal.linkedCardTransactionId) {
      const transaction = candidate.cardTransactions[goal.linkedCardTransactionId];
      if (!transaction || transaction.linkedPurchaseGoalId !== goal.id || transaction.reversedAt) return false;
    }
  }
  return true;
};
