import type { MonthlyExpenseOccurrence } from "../models/finance";
import { deriveDatedStatus } from "./financialCalculations";

export type BudgetStatusFilter = "all" | "payable" | "overdue" | "paid" | "cancelled";

export interface BudgetFilters {
  search: string;
  category: string;
  status: BudgetStatusFilter;
  todayKey: string;
  dueSoonDays: number;
}

const normalizeSearchText = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .trim();

export const filterBudgetOccurrences = (
  occurrences: MonthlyExpenseOccurrence[],
  filters: BudgetFilters,
): MonthlyExpenseOccurrence[] => {
  const query = normalizeSearchText(filters.search);

  return occurrences.filter((occurrence) => {
    if (filters.category === "uncategorized" && occurrence.category) return false;
    if (filters.category && filters.category !== "uncategorized" && occurrence.category !== filters.category) return false;

    const derivedStatus = deriveDatedStatus(occurrence, filters.todayKey, filters.dueSoonDays);
    if (filters.status === "payable" && occurrence.status !== "upcoming") return false;
    if (filters.status === "overdue" && derivedStatus !== "overdue") return false;
    if (filters.status === "paid" && occurrence.status !== "paid") return false;
    if (filters.status === "cancelled" && occurrence.status !== "cancelled") return false;

    if (!query) return true;
    const searchableText = normalizeSearchText([
      occurrence.name,
      occurrence.category,
      occurrence.excelRowLabel,
    ].filter(Boolean).join(" "));
    return searchableText.includes(query);
  });
};
