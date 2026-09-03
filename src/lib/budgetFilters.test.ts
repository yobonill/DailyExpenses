import { describe, expect, it } from "vitest";
import type { MonthlyExpenseOccurrence } from "../models/finance";
import { filterBudgetOccurrences, type BudgetFilters } from "./budgetFilters";

const metadata = {
  createdAt: "2026-08-01T12:00:00.000Z",
  createdBy: "u1",
  updatedAt: "2026-08-01T12:00:00.000Z",
  updatedBy: "u1",
  version: 1,
};

const occurrence = (
  id: string,
  overrides: Partial<MonthlyExpenseOccurrence> = {},
): MonthlyExpenseOccurrence => ({
  id,
  name: id,
  category: "Servicios",
  expectedAmountMinor: 10000,
  currency: "DOP",
  dueDate: "2026-08-20",
  financialMonth: "2026-08",
  quincena: 1,
  status: "upcoming",
  canPayWithCard: true,
  oneTime: false,
  ...metadata,
  ...overrides,
});

const defaults: BudgetFilters = {
  search: "",
  category: "",
  status: "all",
  todayKey: "2026-08-18",
  dueSoonDays: 5,
};

describe("budget filters", () => {
  const rows = [
    occurrence("electricidad", { name: "Energía eléctrica", excelRowLabel: "Luz", dueDate: "2026-08-17" }),
    occurrence("internet", { name: "Internet", category: "Suscripciones y entretenimiento" }),
    occurrence("colegio", { name: "Colegio", category: "Educación", status: "paid" }),
    occurrence("cancelado", { name: "Seguro", category: undefined, status: "cancelled" }),
  ];

  it("searches names, categories and Excel rows without requiring accents", () => {
    expect(filterBudgetOccurrences(rows, { ...defaults, search: "energia" }).map((item) => item.id)).toEqual(["electricidad"]);
    expect(filterBudgetOccurrences(rows, { ...defaults, search: "entretenimiento" }).map((item) => item.id)).toEqual(["internet"]);
    expect(filterBudgetOccurrences(rows, { ...defaults, search: "luz" }).map((item) => item.id)).toEqual(["electricidad"]);
  });

  it("combines category and payment-state filters", () => {
    expect(filterBudgetOccurrences(rows, { ...defaults, category: "Educación", status: "paid" }).map((item) => item.id)).toEqual(["colegio"]);
    expect(filterBudgetOccurrences(rows, { ...defaults, status: "payable" }).map((item) => item.id)).toEqual(["electricidad", "internet"]);
    expect(filterBudgetOccurrences(rows, { ...defaults, status: "overdue" }).map((item) => item.id)).toEqual(["electricidad"]);
    expect(filterBudgetOccurrences(rows, { ...defaults, category: "uncategorized" }).map((item) => item.id)).toEqual(["cancelado"]);
  });
});
