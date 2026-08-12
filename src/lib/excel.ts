import type { Expense } from "../models/expense";
import { formatExcelAmount } from "./money";

export const getExcelDescription = (expense: Expense): string =>
  expense.quantity > 1 ? `${expense.name} x${expense.quantity}` : expense.name;

export const getExpenseTotalCents = (expense: Expense): number =>
  expense.unitPriceCents * expense.quantity;

export const expenseToExcelRow = (expense: Expense): string =>
  `${getExcelDescription(expense)}\t${formatExcelAmount(getExpenseTotalCents(expense))}`;

export const expensesToExcelRows = (expenses: Expense[]): string =>
  expenses.map(expenseToExcelRow).join("\n");
