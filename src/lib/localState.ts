import type { Expense, ExpenseDraft, PendingOperation } from "../models/expense";

const STATE_KEY = "dailyExpenses.localState.v1";
const DRAFT_KEY = "dailyExpenses.draft.v1";

export interface LocalExpenseState {
  expenses: Expense[];
  pendingOperations: PendingOperation[];
}

const emptyState = (): LocalExpenseState => ({ expenses: [], pendingOperations: [] });

export const readLocalState = (): LocalExpenseState => {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalExpenseState>;
    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      pendingOperations: Array.isArray(parsed.pendingOperations)
        ? parsed.pendingOperations
        : [],
    };
  } catch {
    return emptyState();
  }
};

export const storeLocalState = (state: LocalExpenseState): void => {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
};

export const readDraft = (): ExpenseDraft => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") as Partial<ExpenseDraft>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      price: typeof parsed.price === "string" ? parsed.price : "",
      quantity: typeof parsed.quantity === "string" && parsed.quantity ? parsed.quantity : "1",
    };
  } catch {
    return { name: "", price: "", quantity: "1" };
  }
};

export const storeDraft = (draft: ExpenseDraft): void => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};

export const clearDraft = (): void => {
  localStorage.removeItem(DRAFT_KEY);
};
