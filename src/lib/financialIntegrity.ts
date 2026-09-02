import type { FinancialData, RecordMetadata } from "../models/finance";
import { getFundAllocated, getFundBalance } from "./financialCalculations";

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
  for (const allocation of Object.values(candidate.savingsAllocations)) {
    if (!allocation.active || allocation.releasedAt || allocation.consumedAt) continue;
    const fund = candidate.savingsFunds[allocation.fundId];
    if (!fund || fund.currency !== allocation.currency) return false;
    if (allocation.obligationType === "nonMonthly") {
      const obligation = candidate.nonMonthlyOccurrences[allocation.obligationId];
      if (!obligation || obligation.currency !== allocation.currency) return false;
    } else {
      const statement = candidate.cardStatements[allocation.obligationId];
      if (!statement || statement.currency !== allocation.currency) return false;
    }
  }
  return true;
};
