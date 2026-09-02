import type {
  AppSettings,
  FinancialData,
  FinancialPendingOperation,
  LocalFinancialState,
} from "../models/finance";

export const FINANCIAL_ROOT_PATH = "dailyExpensesBudget/v1";
export const FINANCIAL_STATE_KEY = "dailyExpenses.budget.localState.v1";
export const FINANCIAL_SCHEMA_VERSION = 1 as const;

export const createDefaultSettings = (): AppSettings => ({
  dueSoonDaysMonthly: 7,
  dueSoonDaysCards: 7,
  nonMonthlyWarningMonths: 3,
  estimatedUsdToDopRate: 0,
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
  settings: createDefaultSettings(),
});

const asRecord = <T,>(value: unknown): Record<string, T> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};

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

export const readLocalFinancialState = (): LocalFinancialState => {
  try {
    const raw = localStorage.getItem(FINANCIAL_STATE_KEY);
    if (!raw) return emptyLocalState();
    const parsed = JSON.parse(raw) as Partial<LocalFinancialState>;
    return {
      data: normalizeFinancialData(parsed.data),
      pendingOperations: Array.isArray(parsed.pendingOperations) ? parsed.pendingOperations : [],
    };
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
