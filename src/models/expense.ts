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
  /** Exact deposit account used for transfer/debit payments. */
  moneyAccountId?: string;
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
  includedInOpeningBalance?: boolean;
}

export interface ExpenseDraft {
  name: string;
  price: string;
  quantity: string;
  category: string;
  currency: ExpenseCurrency;
  paymentMethod: ExpensePaymentMethod | "";
  moneyAccountId: string;
  includeTransferFee: boolean;
  transferFee: string;
}

export interface ExpenseEditableFields {
  includedInOpeningBalance?: boolean;
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate: string;
  category?: string;
  currency: ExpenseCurrency;
  paymentMethod: ExpensePaymentMethod;
  moneyAccountId?: string;
  transferFeeCents?: number;
}

export type ExpensePatch = Omit<Partial<Omit<Expense, "id">>, "category" | "moneyAccountId" | "transferredAt" | "deletedAt" | "transferFeeCents"> & {
  category?: string | null;
  moneyAccountId?: string | null;
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
