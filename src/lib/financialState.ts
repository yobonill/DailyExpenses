import type {
  AppSettings,
  FinancialData,
  FinancialPendingOperation,
  LocalFinancialState,
} from "../models/finance";
import { migrateChangeAudit } from "./changeAudit";

export const FINANCIAL_ROOT_PATH = "dailyExpensesBudget/v1";
export const FINANCIAL_STATE_KEY = "dailyExpenses.budget.localState.v1";
export const FINANCIAL_SCHEMA_VERSION = 1 as const;

export const createDefaultSettings = (): AppSettings => ({
  dueSoonDaysMonthly: 7,
  dueSoonDaysCards: 7,
  nonMonthlyWarningMonths: 3,
  estimatedUsdToDopRate: 0,
  transferFeeRatePercent: 0.15,
  updatedAt: new Date(0).toISOString(),
  updatedBy: "system",
});

export const createEmptyFinancialData = (): FinancialData => ({
  schemaVersion: FINANCIAL_SCHEMA_VERSION,
  monthlyTemplates: {},
  monthlyOccurrences: {},
  payments: {},
  incomeTemplates: {},
  incomeOccurrences: {},
  nonMonthlyExpenses: {},
  nonMonthlyOccurrences: {},
  purchaseGoals: {},
  savingsFunds: {},
  savingsTransactions: {},
  savingsAllocations: {},
  creditCards: {},
  cardTransactions: {},
  cardStatements: {},
  cardPaymentPlans: {},
  banks: {},
  moneyAccounts: {},
  moneyTransactions: {},
  loans: {},
  loanTransactions: {},
  savingsAccountReconciliations: {},
  balanceIssues: {},
  cycleClosings: {},
  changeAudits: {},
  managedExpenses: {},
  settings: createDefaultSettings(),
});

const asRecord = <T,>(value: unknown): Record<string, T> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};

const normalizeChangeAudits = (value: unknown): FinancialData["changeAudits"] =>
  Object.fromEntries(
    Object.entries(asRecord(value)).map(([id, audit]) => [id, migrateChangeAudit(audit)]),
  ) as FinancialData["changeAudits"];

export const normalizeFinancialData = (value: unknown): FinancialData => {
  const raw = value && typeof value === "object" ? (value as Partial<FinancialData>) : {};
  const defaults = createEmptyFinancialData();
  return {
    schemaVersion: FINANCIAL_SCHEMA_VERSION,
    monthlyTemplates: asRecord(raw.monthlyTemplates),
    monthlyOccurrences: asRecord(raw.monthlyOccurrences),
    payments: asRecord(raw.payments),
    incomeTemplates: asRecord(raw.incomeTemplates),
    incomeOccurrences: asRecord(raw.incomeOccurrences),
    nonMonthlyExpenses: asRecord(raw.nonMonthlyExpenses),
    nonMonthlyOccurrences: asRecord(raw.nonMonthlyOccurrences),
    purchaseGoals: asRecord(raw.purchaseGoals),
    savingsFunds: asRecord(raw.savingsFunds),
    savingsTransactions: asRecord(raw.savingsTransactions),
    savingsAllocations: asRecord(raw.savingsAllocations),
    creditCards: asRecord(raw.creditCards),
    cardTransactions: asRecord(raw.cardTransactions),
    cardStatements: asRecord(raw.cardStatements),
    cardPaymentPlans: asRecord(raw.cardPaymentPlans),
    banks: asRecord(raw.banks),
    moneyAccounts: asRecord(raw.moneyAccounts),
    moneyTransactions: asRecord(raw.moneyTransactions),
    loans: asRecord(raw.loans),
    loanTransactions: asRecord(raw.loanTransactions),
    savingsAccountReconciliations: asRecord(raw.savingsAccountReconciliations),
    balanceIssues: asRecord(raw.balanceIssues),
    cycleClosings: asRecord(raw.cycleClosings),
    changeAudits: normalizeChangeAudits(raw.changeAudits),
    managedExpenses: asRecord(raw.managedExpenses),
    reviewControl: raw.reviewControl,
    settings: raw.settings && typeof raw.settings === "object"
      ? { ...defaults.settings, ...raw.settings }
      : defaults.settings,
    lastBackupAt: typeof raw.lastBackupAt === "string" ? raw.lastBackupAt : undefined,
  };
};

const setAtPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === null) delete cursor[last];
  else cursor[last] = value;
};

export const applyFinancialUpdates = (
  data: FinancialData,
  updates: Record<string, unknown>,
): FinancialData => {
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  Object.entries(updates).forEach(([path, value]) => setAtPath(clone, path, value));
  return normalizeFinancialData(clone);
};

export const applyPendingFinancialOperations = (
  remote: FinancialData,
  operations: FinancialPendingOperation[],
): FinancialData => operations.reduce(
  (current, operation) => operation.replaceRoot
    ? normalizeFinancialData(operation.replaceRoot)
    : applyFinancialUpdates(current, operation.updates),
  remote,
);

const emptyLocalState = (): LocalFinancialState => ({
  data: createEmptyFinancialData(),
  pendingOperations: [],
});

export const migratePendingFinancialOperation = (operation: FinancialPendingOperation): FinancialPendingOperation => {
  if (operation.replaceRoot) {
    return { ...operation, replaceRoot: normalizeFinancialData(operation.replaceRoot) };
  }
  let changed = false;
  const updates = Object.fromEntries(Object.entries(operation.updates || {}).map(([path, value]) => {
    if (!path.startsWith("changeAudits/")) return [path, value];
    const migrated = migrateChangeAudit(value);
    if (JSON.stringify(migrated) !== JSON.stringify(value)) changed = true;
    return [path, migrated];
  }));
  return changed ? { ...operation, updates } : operation;
};

export const migrateLocalFinancialState = (state: LocalFinancialState): LocalFinancialState => ({
  data: normalizeFinancialData(state.data),
  pendingOperations: state.pendingOperations.map(migratePendingFinancialOperation),
});

export const hasLocalFinancialState = (): boolean => {
  try {
    const raw = localStorage.getItem(FINANCIAL_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<LocalFinancialState>;
    return Boolean(parsed.data && typeof parsed.data === "object");
  } catch {
    return false;
  }
};

export const readLocalFinancialState = (): LocalFinancialState => {
  try {
    const raw = localStorage.getItem(FINANCIAL_STATE_KEY);
    if (!raw) return emptyLocalState();
    const parsed = JSON.parse(raw) as Partial<LocalFinancialState>;
    const migrated = migrateLocalFinancialState({
      data: normalizeFinancialData(parsed.data),
      pendingOperations: Array.isArray(parsed.pendingOperations) ? parsed.pendingOperations : [],
    });
    const serialized = JSON.stringify(migrated);
    if (serialized !== raw) localStorage.setItem(FINANCIAL_STATE_KEY, serialized);
    return migrated;
  } catch {
    return emptyLocalState();
  }
};

export const storeLocalFinancialState = (state: LocalFinancialState): void => {
  localStorage.setItem(FINANCIAL_STATE_KEY, JSON.stringify(state));
};

export const clearLocalFinancialState = (): void => {
  localStorage.removeItem(FINANCIAL_STATE_KEY);
};
