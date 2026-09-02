export type ExpenseStatus = "pending" | "transferred";
export type SyncState = "connecting" | "saving" | "synced" | "offline" | "error";
export type ExpenseCurrency = "DOP" | "USD";
export type ExpensePaymentMethod = "cash" | "debit" | "transfer" | "creditCard";

export interface Expense {
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate: string;
  occurredAt: string;
  category?: string;
  currency?: ExpenseCurrency;
  paymentMethod?: ExpensePaymentMethod;
  /**
   * Legacy compatibility field. New expenses are final as soon as they are
   * created, so the application always stores them as transferred.
   */
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
  category: string;
  currency: ExpenseCurrency;
  paymentMethod: ExpensePaymentMethod;
}

export interface ExpenseEditableFields {
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate: string;
  category?: string;
  currency: ExpenseCurrency;
  paymentMethod: ExpensePaymentMethod;
}

export type ExpensePatch = Omit<Partial<Omit<Expense, "id">>, "category" | "transferredAt" | "deletedAt"> & {
  category?: string | null;
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
