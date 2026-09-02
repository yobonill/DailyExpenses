import {
  getMonthKey,
  getQuincena,
  toLocalDateKey,
  type Quincena,
} from "./date";
import type { DueDateRule } from "../models/finance";

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export const parseLocalDate = (dateKey: string): LocalDateParts => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
};

export const formatDateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

export const shiftCalendarMonth = (
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } => {
  const shifted = new Date(year, month - 1 + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
};

export const shiftFinancialMonth = (monthKey: string, offset: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = shiftCalendarMonth(year, month, offset);
  return `${shifted.year}-${String(shifted.month).padStart(2, "0")}`;
};

export const dateFromFinancialMonthRule = (
  financialMonth: string,
  rule: DueDateRule,
): string => {
  const [year, month] = financialMonth.split("-").map(Number);
  const rawDay = rule.kind === "lastDay" ? lastDayOfMonth(year, month) : Math.max(1, Math.min(31, rule.day || 1));
  const target = rawDay <= 14 ? shiftCalendarMonth(year, month, 1) : { year, month };
  const day = Math.min(rawDay, lastDayOfMonth(target.year, target.month));
  return formatDateKey(target.year, target.month, day);
};

export const addMonthsToDateKey = (dateKey: string, months: number): string => {
  const { year, month, day } = parseLocalDate(dateKey);
  const target = shiftCalendarMonth(year, month, months);
  return formatDateKey(target.year, target.month, Math.min(day, lastDayOfMonth(target.year, target.month)));
};

export const addYearsToDateKey = (dateKey: string, years: number): string => {
  const { year, month, day } = parseLocalDate(dateKey);
  const targetYear = year + years;
  return formatDateKey(targetYear, month, Math.min(day, lastDayOfMonth(targetYear, month)));
};

export const addDaysToDateKey = (dateKey: string, days: number): string => {
  const { year, month, day } = parseLocalDate(dateKey);
  const date = new Date(year, month - 1, day + days);
  return formatDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

export const financialMonthDifference = (fromKey: string, toKey: string): number => {
  const [fromYear, fromMonth] = fromKey.split("-").map(Number);
  const [toYear, toMonth] = toKey.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
};

export const daysBetween = (fromDateKey: string, toDateKey: string): number => {
  const from = parseLocalDate(fromDateKey);
  const to = parseLocalDate(toDateKey);
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day);
  const toUtc = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toUtc - fromUtc) / 86_400_000);
};

export const monthsBetween = (fromDateKey: string, toDateKey: string): number => {
  const from = parseLocalDate(fromDateKey);
  const to = parseLocalDate(toDateKey);
  return (to.year - from.year) * 12 + (to.month - from.month) + (to.day >= from.day ? 0 : -1);
};

export const getCurrentFinancialPeriod = (date = new Date()): {
  dateKey: string;
  financialMonth: string;
  quincena: Quincena;
} => {
  const dateKey = toLocalDateKey(date);
  return { dateKey, financialMonth: getMonthKey(dateKey), quincena: getQuincena(dateKey) };
};

export const financialMonthKeys = (startKey: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => shiftFinancialMonth(startKey, index));

export const getLatestCutDate = (todayKey: string, cutDay: number): string => {
  const today = parseLocalDate(todayKey);
  const thisCut = formatDateKey(today.year, today.month, Math.min(cutDay, lastDayOfMonth(today.year, today.month)));
  if (thisCut <= todayKey) return thisCut;
  const previous = shiftCalendarMonth(today.year, today.month, -1);
  return formatDateKey(previous.year, previous.month, Math.min(cutDay, lastDayOfMonth(previous.year, previous.month)));
};

export const getPreviousCutDate = (cutDateKey: string, cutDay: number): string => {
  const cut = parseLocalDate(cutDateKey);
  const previous = shiftCalendarMonth(cut.year, cut.month, -1);
  return formatDateKey(previous.year, previous.month, Math.min(cutDay, lastDayOfMonth(previous.year, previous.month)));
};

export const getFirstDueDateAfterCut = (cutDateKey: string, dueDay: number): string => {
  const cut = parseLocalDate(cutDateKey);
  const inSameMonth = formatDateKey(cut.year, cut.month, Math.min(dueDay, lastDayOfMonth(cut.year, cut.month)));
  if (inSameMonth > cutDateKey) return inSameMonth;
  const next = shiftCalendarMonth(cut.year, cut.month, 1);
  return formatDateKey(next.year, next.month, Math.min(dueDay, lastDayOfMonth(next.year, next.month)));
};

export const nextOccurrenceDate = (
  dateKey: string,
  kind: "once" | "months" | "years",
  interval: number,
): string | null => {
  if (kind === "once") return null;
  return kind === "months"
    ? addMonthsToDateKey(dateKey, Math.max(1, interval))
    : addYearsToDateKey(dateKey, Math.max(1, interval));
};
