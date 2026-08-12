export type ExpenseStatus = "pending" | "transferred";
export type SyncState = "connecting" | "saving" | "synced" | "offline" | "error";

export interface Expense {
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate: string;
  occurredAt: string;
  status: ExpenseStatus;
  transferredAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ExpenseDraft {
  name: string;
  price: string;
  quantity: string;
}

export type ExpensePatch = Omit<Partial<Omit<Expense, "id">>, "transferredAt" | "deletedAt"> & {
  transferredAt?: string | null;
  deletedAt?: string | null;
};

export type PendingOperation =
  | {
      id: string;
      type: "create";
      expense: Expense;
    }
  | {
      id: string;
      type: "patch";
      expenseId: string;
      changes: ExpensePatch;
    };