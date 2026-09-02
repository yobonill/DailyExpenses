import type ExcelJS from "exceljs";
import type { Expense } from "../models/expense";
import type { FinancialData, IncomeOccurrence, MonthlyExpenseOccurrence } from "../models/finance";
import { getMonthKey, getQuincena } from "../lib/date";
import { getExpenseTotalCents } from "../lib/excel";
import { getFundBalance } from "../lib/financialCalculations";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DETAIL_CAPACITY = 14;
const BUDGET_CAPACITY = 13;
const APPROVED_BUDGET_LABELS = ["Diezmo", "Comida", "Comida+Pañales", "Gasolina", "Ahorros", "Mesada Yor", "Mesada Yis", "Gastos Hogar", "Medico", "Internet", "Agua", "Luz", "Basura", "Administradora", "Regalo Padres", "Gastos Extras"];
const APPROVED_INCOME_LABELS = ["Nomina yor", "Picota Talo", "Danny Picota", "Jorge reye josue"];

export interface ExcelExportValidation {
  errors: string[];
  warnings: string[];
  pendingExpenseIds: string[];
}

const normalizeLabel = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const labelsMatch = (cellValue: unknown, configured: string): boolean => {
  const cell = normalizeLabel(String(cellValue || ""));
  const target = normalizeLabel(configured);
  if (!cell || !target) return false;
  if (target === "comida") return cell.startsWith("comida");
  return cell === target;
};

export const validateExcelExport = (data: FinancialData, expenses: Expense[], year: number): ExcelExportValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const financialMonths = new Set(Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`));
  const monthly = Object.values(data.monthlyOccurrences).filter((item) => financialMonths.has(item.financialMonth) && item.status !== "cancelled");
  const income = Object.values(data.incomeOccurrences).filter((item) => financialMonths.has(item.financialMonth) && item.status !== "cancelled");
  monthly.filter((item) => item.currency !== "DOP").forEach((item) => errors.push(`${item.name} (${item.financialMonth}) usa ${item.currency}; la plantilla anual solo admite DOP en Presupuesto.`));
  income.filter((item) => item.currency !== "DOP").forEach((item) => errors.push(`${item.name} (${item.financialMonth}) usa ${item.currency}; la plantilla anual solo admite DOP en Ingresos.`));
  monthly.filter((item) => !item.excelRowLabel).forEach((item) => errors.push(`${item.name} (${item.financialMonth}, Q${item.quincena}) no tiene fila de Excel asignada.`));
  income.filter((item) => !item.excelRowLabel).forEach((item) => errors.push(`${item.name} (${item.financialMonth}, Q${item.quincena}) no tiene fila de Excel asignada.`));
  const budgetLabels = new Set(APPROVED_BUDGET_LABELS.map(normalizeLabel));
  const incomeLabels = new Set(APPROVED_INCOME_LABELS.map(normalizeLabel));
  monthly.filter((item) => item.excelRowLabel && !budgetLabels.has(normalizeLabel(item.excelRowLabel))).forEach((item) => errors.push(`${item.name} usa una fila de presupuesto desconocida: ${item.excelRowLabel}.`));
  income.filter((item) => item.excelRowLabel && !incomeLabels.has(normalizeLabel(item.excelRowLabel))).forEach((item) => errors.push(`${item.name} usa una fila de ingreso desconocida: ${item.excelRowLabel}.`));
  for (const monthKey of financialMonths) {
    for (const quincena of [1, 2] as const) {
      const budgetLabels = new Set(monthly.filter((item) => item.financialMonth === monthKey && item.quincena === quincena).map((item) => normalizeLabel(item.excelRowLabel || item.name)));
      if (budgetLabels.size > BUDGET_CAPACITY) errors.push(`${monthKey} Q${quincena} tiene ${budgetLabels.size} filas de presupuesto y solo caben ${BUDGET_CAPACITY}.`);
      const detailCount = expenses.filter((expense) => !expense.deletedAt && getMonthKey(expense.occurredDate) === monthKey && getQuincena(expense.occurredDate) === quincena).length;
      if (detailCount > DETAIL_CAPACITY) errors.push(`${monthKey} Q${quincena} tiene ${detailCount} gastos diarios y el bloque Detalles Gastos Extras admite ${DETAIL_CAPACITY}.`);
    }
  }
  const pendingExpenseIds = expenses.filter((expense) => !expense.deletedAt && expense.status === "pending" && getMonthKey(expense.occurredDate).startsWith(`${year}-`)).map((expense) => expense.id);
  if (pendingExpenseIds.length) warnings.push(`${pendingExpenseIds.length} gasto(s) diario(s) pendiente(s) se incluirán. El archivo no los marcará como registrados sin tu confirmación.`);
  if (Object.values(data.nonMonthlyOccurrences).some((item) => getMonthKey(item.dueDate).startsWith(`${year}-`))) warnings.push("Los gastos no mensuales permanecen autoritativos en la aplicación porque la plantilla original no tiene un bloque dedicado.");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], pendingExpenseIds };
};

const clearValueCells = (sheet: ExcelJS.Worksheet, rowStart: number) => {
  for (let row = rowStart + 3; row <= rowStart + 18; row += 1) {
    [3, 4, 6, 7, 9, 11, 14, 16, 18, 20].forEach((column) => { sheet.getCell(row, column).value = null; });
  }
  for (let row = rowStart + 3; row <= rowStart + 16; row += 1) {
    [13, 15, 17, 19].forEach((column) => { sheet.getCell(row, column).value = null; });
  }
};

const findOrAssignRow = (
  sheet: ExcelJS.Worksheet,
  labelColumn: number,
  startRow: number,
  endRow: number,
  label: string,
): number => {
  for (let row = startRow; row <= endRow; row += 1) if (labelsMatch(sheet.getCell(row, labelColumn).value, label)) return row;
  for (let row = startRow; row <= endRow; row += 1) {
    if (!String(sheet.getCell(row, labelColumn).value || "").trim()) {
      sheet.getCell(row, labelColumn).value = label;
      return row;
    }
  }
  throw new Error(`No hay espacio para la fila ${label}.`);
};

const groupByLabel = <T extends MonthlyExpenseOccurrence | IncomeOccurrence>(items: T[]) => {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = item.excelRowLabel || item.name;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });
  return grouped;
};

export interface ExcelExportResult {
  fileName: string;
  blob: Blob;
  validation: ExcelExportValidation;
}

const populateBudgetWorkbook = async (
  templateBuffer: ArrayBuffer | Uint8Array,
  data: FinancialData,
  expenses: Expense[],
  year: number,
  validation: ExcelExportValidation,
): Promise<ExcelExportResult> => {
  const ExcelJSLibrary = (await import("exceljs")).default;
  const workbook = new ExcelJSLibrary.Workbook();
  await workbook.xlsx.load(templateBuffer as ArrayBuffer);
  const sheet = workbook.getWorksheet("2026");
  if (!sheet) throw new Error("La plantilla no contiene la hoja 2026.");
  sheet.name = String(year);

  let annualIncome = 0;
  let annualSpending = 0;
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const rowStart = 7 + monthIndex * 22;
    clearValueCells(sheet, rowStart);
    sheet.getCell(rowStart, 2).value = `Gastos Mes ${MONTH_NAMES[monthIndex]}`;
    sheet.getCell(rowStart, 8).value = `Ingresos Mes ${MONTH_NAMES[monthIndex]}`;
    const monthOccurrences = Object.values(data.monthlyOccurrences).filter((item) => item.financialMonth === monthKey && item.status !== "cancelled" && item.currency === "DOP");
    const monthIncome = Object.values(data.incomeOccurrences).filter((item) => item.financialMonth === monthKey && item.status !== "cancelled" && item.currency === "DOP");

    const budgetTotals = { 1: { planned: 0, paid: 0, pending: 0 }, 2: { planned: 0, paid: 0, pending: 0 } };
    for (const quincena of [1, 2] as const) {
      const labelColumn = quincena === 1 ? 2 : 5;
      const remainingColumn = quincena === 1 ? 3 : 6;
      const paidColumn = quincena === 1 ? 4 : 7;
      for (const [label, rows] of groupByLabel(monthOccurrences.filter((item) => item.quincena === quincena))) {
        const targetRow = findOrAssignRow(sheet, labelColumn, rowStart + 3, rowStart + 15, label);
        const expected = rows.reduce((total, item) => total + item.expectedAmountMinor, 0) / 100;
        const paid = rows.reduce((total, item) => total + (item.status === "paid" ? item.actualAmountMinor ?? item.expectedAmountMinor : 0), 0) / 100;
        sheet.getCell(targetRow, remainingColumn).value = expected - paid;
        sheet.getCell(targetRow, paidColumn).value = paid || null;
        budgetTotals[quincena].planned += Math.max(expected, paid);
        budgetTotals[quincena].paid += paid;
        budgetTotals[quincena].pending += Math.max(0, expected - paid);
      }
      const totalRow = rowStart + 16;
      const pendingRow = rowStart + 17;
      const remainingRow = rowStart + 18;
      sheet.getCell(totalRow, remainingColumn).value = budgetTotals[quincena].planned;
      sheet.getCell(pendingRow, remainingColumn).value = budgetTotals[quincena].pending;
      const incomeTotal = monthIncome.filter((item) => item.quincena === quincena).reduce((total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.exportExpectedWhenPending ? item.expectedAmountMinor : 0), 0) / 100;
      sheet.getCell(remainingRow, remainingColumn).value = incomeTotal - budgetTotals[quincena].planned;

      const incomeLabelColumn = quincena === 1 ? 8 : 10;
      const incomeValueColumn = quincena === 1 ? 9 : 11;
      for (const [label, rows] of groupByLabel(monthIncome.filter((item) => item.quincena === quincena))) {
        const targetRow = findOrAssignRow(sheet, incomeLabelColumn, rowStart + 3, rowStart + 15, label);
        const amount = rows.reduce((total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.exportExpectedWhenPending ? item.expectedAmountMinor : 0), 0) / 100;
        sheet.getCell(targetRow, incomeValueColumn).value = amount || null;
      }
      sheet.getCell(totalRow, incomeValueColumn).value = incomeTotal;

      const details = expenses.filter((expense) => !expense.deletedAt && getMonthKey(expense.occurredDate) === monthKey && getQuincena(expense.occurredDate) === quincena).sort((a, b) => a.occurredDate.localeCompare(b.occurredDate) || a.createdAt.localeCompare(b.createdAt));
      const detailNameColumn = quincena === 1 ? 13 : 15;
      const detailValueColumn = quincena === 1 ? 14 : 16;
      details.forEach((expense, index) => {
        const row = rowStart + 3 + index;
        sheet.getCell(row, detailNameColumn).value = expense.quantity > 1 ? `${expense.name} x${expense.quantity}` : expense.name;
        sheet.getCell(row, detailValueColumn).value = getExpenseTotalCents(expense) / 100;
      });
      const detailTotal = details.reduce((total, expense) => total + getExpenseTotalCents(expense), 0) / 100;
      sheet.getCell(rowStart + 17, detailValueColumn).value = detailTotal;
      annualSpending += detailTotal;
    }
    const monthIncomeTotal = monthIncome.reduce((total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.exportExpectedWhenPending ? item.expectedAmountMinor : 0), 0) / 100;
    const monthBudgetTotal = budgetTotals[1].planned + budgetTotals[2].planned;
    sheet.getCell(rowStart + 18, 7).value = (sheet.getCell(rowStart + 18, 3).value as number || 0) + (sheet.getCell(rowStart + 18, 6).value as number || 0);
    sheet.getCell(rowStart + 18, 9).value = monthIncomeTotal;
    sheet.getCell(rowStart + 18, 11).value = monthBudgetTotal;
    sheet.getCell(rowStart + 18, 14).value = (sheet.getCell(rowStart + 17, 14).value as number || 0) + (sheet.getCell(rowStart + 17, 16).value as number || 0);
    sheet.getCell(rowStart + 18, 18).value = 0;
    annualIncome += monthIncomeTotal;
    annualSpending += monthOccurrences.filter((item) => item.status === "paid").reduce((total, item) => total + (item.actualAmountMinor ?? item.expectedAmountMinor), 0) / 100;
  }

  const savingsDop = Object.values(data.savingsFunds).filter((fund) => fund.currency === "DOP" && !fund.archivedAt).reduce((total, fund) => total + getFundBalance(data, fund.id), 0) / 100;
  sheet.getCell("N2").value = annualIncome;
  sheet.getCell("N3").value = annualSpending;
  sheet.getCell("N4").value = annualIncome - annualSpending;
  sheet.getCell("N5").value = savingsDop;

  const output = await workbook.xlsx.writeBuffer();
  return {
    fileName: `Presupuesto ${year}.xlsx`,
    blob: new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    validation,
  };
};

export const createBudgetWorkbookFromTemplate = async (
  templateBuffer: ArrayBuffer | Uint8Array,
  data: FinancialData,
  expenses: Expense[],
  year: number,
): Promise<ExcelExportResult> => {
  const validation = validateExcelExport(data, expenses, year);
  if (validation.errors.length) throw Object.assign(new Error("La exportación tiene conflictos."), { validation });
  return populateBudgetWorkbook(templateBuffer, data, expenses, year, validation);
};

export const createBudgetWorkbook = async (data: FinancialData, expenses: Expense[], year: number): Promise<ExcelExportResult> => {
  const validation = validateExcelExport(data, expenses, year);
  if (validation.errors.length) throw Object.assign(new Error("La exportación tiene conflictos."), { validation });
  const response = await fetch(`${import.meta.env.BASE_URL}templates/Presupuesto-2026.xlsx`);
  if (!response.ok) throw new Error("No se pudo cargar la plantilla Presupuesto 2026.");
  return populateBudgetWorkbook(await response.arrayBuffer(), data, expenses, year, validation);
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
