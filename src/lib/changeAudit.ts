import type { AuditChangeEntry, AuditSnapshot, ChangeAudit } from "../models/review";

export const AUDITED_FINANCIAL_PATH = /^(payments|moneyTransactions|cardTransactions|savingsTransactions|loanTransactions|managedExpenses)\//;

export const isAuditedFinancialPath = (path: string): boolean =>
  AUDITED_FINANCIAL_PATH.test(path);

const isEntry = (value: unknown): value is AuditChangeEntry =>
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && typeof (value as { path?: unknown }).path === "string";

/**
 * Firebase Realtime Database does not allow '/', '.', '#', '$', '[' or ']'
 * inside object keys. Financial paths therefore live as string values inside
 * audit entries instead of being used as map keys.
 *
 * The Record branch is intentionally retained as an input format so devices
 * that already queued a pre-2.2.1 operation can migrate it locally and retry
 * it without losing the user's change.
 */
export const auditEntries = (snapshot: AuditSnapshot | unknown): AuditChangeEntry[] => {
  if (Array.isArray(snapshot)) {
    return snapshot.filter(isEntry).map((entry) => ({ path: entry.path, value: entry.value ?? null }));
  }
  if (!snapshot || typeof snapshot !== "object") return [];
  return Object.entries(snapshot as Record<string, unknown>).map(([path, value]) => ({ path, value: value ?? null }));
};

export const auditEntriesFromUpdates = (updates: Record<string, unknown>): AuditChangeEntry[] =>
  Object.entries(updates).map(([path, value]) => ({ path, value: value ?? null }));

export const migrateChangeAudit = (value: unknown): ChangeAudit | unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const audit = value as Partial<ChangeAudit> & { before?: unknown; after?: unknown };
  if (typeof audit.id !== "string") return value;
  return {
    ...audit,
    before: auditEntries(audit.before),
    after: auditEntries(audit.after),
  } as ChangeAudit;
};

export const findAuditValue = (snapshot: AuditSnapshot, path: string): unknown =>
  auditEntries(snapshot).find((entry) => entry.path === path)?.value;
