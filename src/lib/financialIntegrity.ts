import type { FinancialData, RecordMetadata } from "../models/finance";
import { getCardCurrentDebt, getFundAllocated, getFundBalance, getPurchaseGoalReserved } from "./financialCalculations";

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
      if (incomingVersion === 1 && currentVersion >= 1) continue;
      if (incomingVersion !== currentVersion + 1) return { updates: {}, conflict: true };
    }
    updates[path] = value;
  }
  return { updates, conflict: false };
};

export const isFinanciallyConsistent = (candidate: FinancialData): boolean => {
  const activePaymentKeys = new Set<string>();
  for (const payment of Object.values(candidate.payments)) {
    if (payment.reversedAt) continue;
    const key = `${payment.sourceType}:${payment.sourceId}`;
    if (activePaymentKeys.has(key)) return false;
    activePaymentKeys.add(key);
  }
  for (const fundId of Object.keys(candidate.savingsFunds)) {
    const balance = getFundBalance(candidate, fundId);
    if (balance < 0 || getFundAllocated(candidate, fundId) > balance) return false;
  }
  for (const transaction of Object.values(candidate.cardTransactions)) {
    if (transaction.settlementAmountDopMinor !== undefined
      && (transaction.type !== "payment"
        || transaction.currency !== "USD"
        || transaction.amountMinor <= 0
        || transaction.settlementAmountDopMinor <= 0)) return false;
    if (transaction.linkedPurchaseGoalId) {
      const goal = candidate.purchaseGoals[transaction.linkedPurchaseGoalId];
      if (!goal || goal.currency !== transaction.currency) return false;
    }
  }
  for (const cardId of Object.keys(candidate.creditCards)) {
    if (getCardCurrentDebt(candidate, cardId, "DOP") < 0
      || getCardCurrentDebt(candidate, cardId, "USD") < 0) return false;
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
