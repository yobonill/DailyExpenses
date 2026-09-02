import { ref, update } from "firebase/database";
import type { Expense } from "../models/expense";
import type { FinancialData } from "../models/finance";
import { FINANCIAL_ROOT_PATH, FINANCIAL_SCHEMA_VERSION, normalizeFinancialData } from "../lib/financialState";
import { getAuthenticatedFirebaseServices } from "./firebase";
import { downloadBlob } from "./excelBudgetExport";

export interface DailyExpensesBackup {
  format: "daily-expenses-budget-backup";
  version: 1;
  exportedAt: string;
  schemaVersion: 1;
  expenses: Expense[];
  financialData: FinancialData;
}

export interface BackupPreview {
  valid: boolean;
  errors: string[];
  exportedAt?: string;
  counts: Record<string, number>;
  backup?: DailyExpensesBackup;
}

export const createBackup = (financialData: FinancialData, expenses: Expense[]): DailyExpensesBackup => ({
  format: "daily-expenses-budget-backup",
  version: 1,
  exportedAt: new Date().toISOString(),
  schemaVersion: FINANCIAL_SCHEMA_VERSION,
  expenses,
  financialData,
});

export const downloadBackup = (backup: DailyExpensesBackup, prefix = "daily-expenses-backup"): void => {
  const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `${prefix}-${stamp}.json`);
};

export const validateBackupText = (text: string): BackupPreview => {
  const errors: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { valid: false, errors: ["El archivo no contiene JSON válido."], counts: {} }; }
  if (!raw || typeof raw !== "object") return { valid: false, errors: ["El archivo no tiene la estructura esperada."], counts: {} };
  const candidate = raw as Partial<DailyExpensesBackup>;
  if (candidate.format !== "daily-expenses-budget-backup") errors.push("El archivo no es un respaldo de Daily Expenses.");
  if (candidate.version !== 1 || candidate.schemaVersion !== 1) errors.push("La versión del respaldo no es compatible.");
  if (!Array.isArray(candidate.expenses)) errors.push("Falta la colección de gastos diarios.");
  if (!candidate.financialData || typeof candidate.financialData !== "object") errors.push("Faltan los datos financieros.");
  const financial = normalizeFinancialData(candidate.financialData);
  const counts = {
    gastosDiarios: Array.isArray(candidate.expenses) ? candidate.expenses.length : 0,
    gastosMensuales: Object.keys(financial.monthlyOccurrences).length,
    ingresos: Object.keys(financial.incomeOccurrences).length,
    tarjetas: Object.keys(financial.creditCards).length,
    gastosNoMensuales: Object.keys(financial.nonMonthlyOccurrences).length,
    metasDeCompra: Object.keys(financial.purchaseGoals).length,
    fondos: Object.keys(financial.savingsFunds).length,
  };
  const backup: DailyExpensesBackup | undefined = errors.length ? undefined : {
    format: "daily-expenses-budget-backup",
    version: 1,
    schemaVersion: 1,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date(0).toISOString(),
    expenses: candidate.expenses as Expense[],
    financialData: financial,
  };
  return { valid: !errors.length, errors, exportedAt: backup?.exportedAt, counts, backup };
};

export const restoreBackupAtomically = async (backup: DailyExpensesBackup): Promise<void> => {
  const { database } = getAuthenticatedFirebaseServices();
  const expenseMap = Object.fromEntries(backup.expenses.map((expense) => [expense.id, expense]));
  await update(ref(database), {
    expenses: expenseMap,
    [FINANCIAL_ROOT_PATH]: backup.financialData,
  });
  localStorage.removeItem("dailyExpenses.localState.v1");
  localStorage.removeItem("dailyExpenses.budget.localState.v1");
};
