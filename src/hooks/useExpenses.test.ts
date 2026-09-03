import { describe, expect, it } from "vitest";
import type { Expense, PendingOperation } from "../models/expense";
import { getExpenseForRemoteWrite } from "./useExpenses";

const legacyExpense = {
  id: "expense-1",
  name: "  Compra anterior  ",
  unitPriceCents: 12500,
  quantity: 1,
  occurredDate: "2026-09-01",
  occurredAt: "2026-09-01T12:00:00.000Z",
  status: "pending",
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
} as Expense;

describe("daily expense remote synchronization payload", () => {
  it("normalizes a legacy pending creation before writing it", () => {
    const operation: PendingOperation = { id: "operation-1", type: "create", expense: legacyExpense };
    expect(getExpenseForRemoteWrite(operation, [legacyExpense])).toMatchObject({
      id: "expense-1",
      name: "Compra anterior",
      currency: "DOP",
      paymentMethod: "cash",
      status: "transferred",
    });
  });

  it("sends the complete current expense for a pending edit", () => {
    const editedExpense: Expense = {
      ...legacyExpense,
      name: "Compra corregida",
      currency: "USD",
      paymentMethod: "creditCard",
      status: "transferred",
      updatedAt: "2026-09-02T12:00:00.000Z",
    };
    const operation: PendingOperation = {
      id: "operation-2",
      type: "patch",
      expenseId: editedExpense.id,
      changes: { name: editedExpense.name, updatedAt: editedExpense.updatedAt },
    };

    expect(getExpenseForRemoteWrite(operation, [editedExpense])).toEqual(editedExpense);
  });
});
