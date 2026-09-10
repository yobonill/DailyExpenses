import type {
  MonthlyExpenseOccurrence,
  NonMonthlyOccurrence,
  RecordMetadata,
} from "../models/finance";
import { getMonthKey, getQuincena } from "./date";
import { lastDayOfMonth, parseLocalDate } from "./financeDates";

export type PostponableOccurrence = MonthlyExpenseOccurrence | NonMonthlyOccurrence;

const isValidDateKey = (dateKey: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const { year, month, day } = parseLocalDate(dateKey);
  return year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month);
};

const assertCanPostpone = (occurrence: PostponableOccurrence, newDueDate: string): void => {
  if (occurrence.status !== "upcoming") throw new Error("Solo se puede postergar una obligación pendiente.");
  if (!isValidDateKey(newDueDate)) throw new Error("Selecciona una nueva fecha válida.");
  if (newDueDate <= occurrence.dueDate) throw new Error("La nueva fecha debe ser posterior al vencimiento actual.");
};

export const buildPostponedMonthlyOccurrence = (
  occurrence: MonthlyExpenseOccurrence,
  newDueDate: string,
  metadata: RecordMetadata,
): MonthlyExpenseOccurrence => {
  assertCanPostpone(occurrence, newDueDate);
  return {
    ...occurrence,
    dueDate: newDueDate,
    financialMonth: getMonthKey(newDueDate),
    quincena: getQuincena(newDueDate),
    originalDueDate: occurrence.originalDueDate || occurrence.dueDate,
    originalFinancialMonth: occurrence.originalFinancialMonth || occurrence.financialMonth,
    originalQuincena: occurrence.originalQuincena || occurrence.quincena,
    postponedAt: metadata.updatedAt,
    ...metadata,
  };
};

export const buildPostponedNonMonthlyOccurrence = (
  occurrence: NonMonthlyOccurrence,
  newDueDate: string,
  metadata: RecordMetadata,
): NonMonthlyOccurrence => {
  assertCanPostpone(occurrence, newDueDate);
  return {
    ...occurrence,
    dueDate: newDueDate,
    originalDueDate: occurrence.originalDueDate || occurrence.dueDate,
    postponedAt: metadata.updatedAt,
    ...metadata,
  };
};

export const wasOriginallyInSelectedPeriod = (
  occurrence: MonthlyExpenseOccurrence,
  monthKeys: Set<string>,
  quincena: 1 | 2 | "all",
): boolean => {
  const financialMonth = occurrence.originalFinancialMonth || occurrence.financialMonth;
  const plannedQuincena = occurrence.originalQuincena || occurrence.quincena;
  return monthKeys.has(financialMonth) && (quincena === "all" || plannedQuincena === quincena);
};
