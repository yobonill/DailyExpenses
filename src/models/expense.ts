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
  transferFeeCents?: number;
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
  includeTransferFee: boolean;
  transferFee: string;
}

export interface ExpenseEditableFields {
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate: string;
  category?: string;
  currency: ExpenseCurrency;
  paymentMethod: ExpensePaymentMethod;
  transferFeeCents?: number;
}

export type ExpensePatch = Omit<Partial<Omit<Expense, "id">>, "category" | "transferredAt" | "deletedAt" | "transferFeeCents"> & {
  category?: string | null;
  transferredAt?: string | null;
  deletedAt?: string | null;
  transferFeeCents?: number | null;
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
