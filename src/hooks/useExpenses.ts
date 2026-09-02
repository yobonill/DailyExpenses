import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, set, update, type Unsubscribe } from "firebase/database";
import { getAuthenticatedFirebaseServices } from "../services/firebase";
import type {
  Expense,
  ExpenseEditableFields,
  ExpensePaymentMethod,
  ExpensePatch,
  PendingOperation,
  SyncState,
} from "../models/expense";
import { createId } from "../lib/id";
import {
  readLocalState,
  storeLocalState,
  type LocalExpenseState,
} from "../lib/localState";
import { toLocalDateKey } from "../lib/date";
import { appendSyncLog } from "../lib/syncLog";

const normalizeExpense = (raw: Partial<Expense> & { id: string }): Expense => {
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const occurredDate =
    typeof raw.occurredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.occurredDate)
      ? raw.occurredDate
      : toLocalDateKey(new Date(raw.occurredAt || createdAt));
  const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
  const unitPriceCents = Math.max(1, Math.round(Number(raw.unitPriceCents) || 1));
  const paymentMethod: ExpensePaymentMethod = raw.paymentMethod === "debit"
    || raw.paymentMethod === "transfer"
    || raw.paymentMethod === "creditCard"
    ? raw.paymentMethod
    : "cash";

  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    unitPriceCents,
    quantity,
    occurredDate,
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : createdAt,
    category: typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : undefined,
    currency: paymentMethod === "creditCard" && raw.currency === "USD" ? "USD" : "DOP",
    paymentMethod,
    // Captured expenses are real, completed expenses. Treat legacy pending
    // records as completed too so the old Excel review queue disappears.
    status: "transferred",
    transferredAt: typeof raw.transferredAt === "string" ? raw.transferredAt : undefined,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : undefined,
  };
};

const stripUndefined = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const expenseSyncErrorMessage = (reason: unknown): string => {
  const code = reason && typeof reason === "object" && "code" in reason
    ? String((reason as { code?: unknown }).code || "")
    : "";
  const normalized = code.toLowerCase();
  if (normalized.includes("permission-denied") || normalized.includes("permission_denied")) {
    return "Firebase rechazó el gasto. Confirma que iniciaste sesión y que publicaste las reglas de Daily Expenses.";
  }
  if (normalized.includes("auth") || normalized.includes("token")) {
    return "La sesión de Firebase no es válida. Cierra sesión, vuelve a entrar y reintenta.";
  }
  return code ? `Firebase no pudo guardar el gasto (${code}).` : "Firebase no pudo guardar el gasto.";
};

const expenseSyncErrorDetails = (reason: unknown): string => {
  if (!(reason instanceof Error)) return String(reason || "Error desconocido");
  const code = "code" in reason ? String((reason as Error & { code?: unknown }).code || "") : "";
  return [code, reason.message].filter(Boolean).join(" · ");
};

const recordToExpenses = (value: unknown): Expense[] => {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Partial<Expense>>)
    .map(([id, expense]) => normalizeExpense({ ...expense, id: expense.id || id }))
    .filter((expense) => expense.name && expense.unitPriceCents > 0);
};

const applyPatch = (expense: Expense, changes: ExpensePatch): Expense => {
  const next = { ...expense } as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return normalizeExpense(next as unknown as Expense);
};

const applyOperation = (
  expenses: Expense[],
  operation: PendingOperation,
): Expense[] => {
  const map = new Map(expenses.map((expense) => [expense.id, expense]));

  if (operation.type === "create") {
    map.set(operation.expense.id, normalizeExpense(operation.expense));
  } else {
    const current = map.get(operation.expenseId);
    if (current) map.set(operation.expenseId, applyPatch(current, operation.changes));
  }

  return [...map.values()];
};

const applyPendingOperations = (
  remoteExpenses: Expense[],
  operations: PendingOperation[],
): Expense[] => operations.reduce(applyOperation, remoteExpenses);

export interface NewExpenseInput {
  name: string;
  unitPriceCents: number;
  quantity: number;
  occurredDate?: string;
  category?: string;
  currency: "DOP" | "USD";
  paymentMethod: ExpensePaymentMethod;
}

export interface UseExpensesResult {
  expenses: Expense[];
  syncState: SyncState;
  syncMessage: string;
  pendingCount: number;
  createExpense: (input: NewExpenseInput) => Promise<Expense>;
  editExpense: (
    expenseId: string,
    changes: ExpenseEditableFields,
  ) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  restoreExpense: (expenseId: string) => Promise<void>;
  retrySync: () => Promise<void>;
}

export const useExpenses = (): UseExpensesResult => {
  const initialState = readLocalState();
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    initialState.expenses.map((expense) => normalizeExpense(expense)),
  );
  const [pendingCount, setPendingCount] = useState(initialState.pendingOperations.length);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  const [syncMessage, setSyncMessage] = useState("Conectando…");

  const localStateRef = useRef<LocalExpenseState>({
    expenses: initialState.expenses.map((expense) => normalizeExpense(expense)),
    pendingOperations: initialState.pendingOperations,
  });
  const remoteExpensesRef = useRef<Expense[]>([]);
  const firebaseConnectedRef = useRef(false);
  const mountedRef = useRef(true);
  const syncingRef = useRef(false);

  const commitState = useCallback((next: LocalExpenseState) => {
    // localStorage is the durable first write. If this throws (for example,
    // storage quota/private-mode restrictions), callers keep the form intact.
    storeLocalState(next);
    localStateRef.current = next;
    if (mountedRef.current) {
      setExpenses(next.expenses);
      setPendingCount(next.pendingOperations.length);
    }
  }, []);

  const removePendingOperation = useCallback(
    (operationId: string) => {
      const current = localStateRef.current;
      const next: LocalExpenseState = {
        ...current,
        pendingOperations: current.pendingOperations.filter(
          (operation) => operation.id !== operationId,
        ),
      };
      commitState(next);
    },
    [commitState],
  );

  const executeOperation = useCallback(
    async (operation: PendingOperation): Promise<boolean> => {
      if (!navigator.onLine || !firebaseConnectedRef.current) return false;

      try {
        setSyncState("saving");
        setSyncMessage("Sincronizando cambios…");
        const { database } = getAuthenticatedFirebaseServices();

        if (operation.type === "create") {
          const normalizedExpense = normalizeExpense(operation.expense);
          await set(
            ref(database, `expenses/${operation.expense.id}`),
            stripUndefined(normalizedExpense),
          );
        } else {
          await update(
            ref(database, `expenses/${operation.expenseId}`),
            stripUndefined(operation.changes),
          );
        }

        removePendingOperation(operation.id);
        return true;
      } catch (reason) {
        console.error("[Daily Expenses] Error al sincronizar un gasto", reason);
        const errorMessage = expenseSyncErrorMessage(reason);
        appendSyncLog("Gastos", "error", `${errorMessage} Detalle técnico: ${expenseSyncErrorDetails(reason)}`);
        if (mountedRef.current) {
          setSyncState(navigator.onLine ? "error" : "offline");
          setSyncMessage(`${errorMessage} El cambio permanece guardado en este dispositivo.`);
        }
        return false;
      }
    },
    [removePendingOperation],
  );

  const retrySync = useCallback(async () => {
    if (syncingRef.current) return;
    const initialCount = localStateRef.current.pendingOperations.length;

    if (!navigator.onLine || !firebaseConnectedRef.current) {
      setSyncState("offline");
      const message = navigator.onLine
        ? "Firebase no ha confirmado conexión. Revisa la sesión o la red y vuelve a intentar."
        : "El dispositivo no tiene conexión a internet.";
      setSyncMessage(initialCount
        ? `${message} ${initialCount} cambio${initialCount === 1 ? "" : "s"} pendiente${initialCount === 1 ? "" : "s"}.`
        : `${message} Datos disponibles en este dispositivo.`);
      if (initialCount > 0) appendSyncLog("Gastos", "error", `${message} Pendientes: ${initialCount}.`);
      return;
    }

    if (!initialCount) {
      setSyncState("synced");
      setSyncMessage("Sincronizado");
      return;
    }

    syncingRef.current = true;
    try {
      // Read the first pending operation again after every successful write.
      // This also picks up operations queued while synchronization is already running.
      while (navigator.onLine && firebaseConnectedRef.current) {
        const operation = localStateRef.current.pendingOperations[0];
        if (!operation) break;
        const succeeded = await executeOperation(operation);
        if (!succeeded) break;
      }
    } finally {
      syncingRef.current = false;
    }

    if (!localStateRef.current.pendingOperations.length && mountedRef.current) {
      setSyncState("synced");
      setSyncMessage("Sincronizado");
      if (initialCount > 0) appendSyncLog("Gastos", "success", `${initialCount} cambio${initialCount === 1 ? "" : "s"} sincronizado${initialCount === 1 ? "" : "s"} correctamente.`);
    }
  }, [executeOperation]);

  const queueOperation = useCallback(
    async (operation: PendingOperation) => {
      const current = localStateRef.current;
      const next: LocalExpenseState = {
        expenses: applyOperation(current.expenses, operation),
        pendingOperations: [...current.pendingOperations, operation],
      };

      commitState(next);

      if (!navigator.onLine || !firebaseConnectedRef.current) {
        setSyncState("offline");
        setSyncMessage("Guardado en este dispositivo · Pendiente de sincronizar");
        return;
      }

      void retrySync();
    },
    [commitState, retrySync],
  );

  const createExpense = useCallback(
    async (input: NewExpenseInput): Promise<Expense> => {
      const now = new Date();
      const nowIso = now.toISOString();
      const expense: Expense = {
        id: createId(),
        name: input.name.trim(),
        unitPriceCents: Math.round(input.unitPriceCents),
        quantity: Math.max(1, Math.floor(input.quantity)),
        occurredDate: input.occurredDate || toLocalDateKey(now),
        occurredAt: nowIso,
        category: input.category?.trim() || undefined,
        currency: input.paymentMethod === "creditCard" && input.currency === "USD" ? "USD" : "DOP",
        paymentMethod: input.paymentMethod,
        status: "transferred",
        transferredAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await queueOperation({ id: createId(), type: "create", expense });
      return expense;
    },
    [queueOperation],
  );

  const patchExpense = useCallback(
    async (expenseId: string, changes: ExpensePatch) => {
      await queueOperation({
        id: createId(),
        type: "patch",
        expenseId,
        changes: { ...changes, updatedAt: new Date().toISOString() },
      });
    },
    [queueOperation],
  );

  const editExpense = useCallback(
    async (
      expenseId: string,
      changes: ExpenseEditableFields,
    ) => {
      await patchExpense(expenseId, {
        name: changes.name.trim(),
        unitPriceCents: Math.round(changes.unitPriceCents),
        quantity: Math.max(1, Math.floor(changes.quantity)),
        occurredDate: changes.occurredDate,
        category: changes.category?.trim() || null,
        currency: changes.paymentMethod === "creditCard" && changes.currency === "USD" ? "USD" : "DOP",
        paymentMethod: changes.paymentMethod,
      });
    },
    [patchExpense],
  );

  const deleteExpense = useCallback(
    async (expenseId: string) => {
      await patchExpense(expenseId, { deletedAt: new Date().toISOString() });
    },
    [patchExpense],
  );

  const restoreExpense = useCallback(
    async (expenseId: string) => {
      await patchExpense(expenseId, { deletedAt: null });
    },
    [patchExpense],
  );

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribeExpenses: Unsubscribe | undefined;
    let unsubscribeConnection: Unsubscribe | undefined;

    const refreshFromRemote = () => {
      if (!mountedRef.current) return;
      const current = localStateRef.current;
      const mergedExpenses = applyPendingOperations(
        remoteExpensesRef.current,
        current.pendingOperations,
      );
      commitState({
        expenses: mergedExpenses,
        pendingOperations: current.pendingOperations,
      });

      if (!current.pendingOperations.length) {
        setSyncState("synced");
        setSyncMessage("Sincronizado");
      }
    };

    try {
      const { database } = getAuthenticatedFirebaseServices();
      setSyncState("connecting");
      setSyncMessage("Conectando…");

      unsubscribeConnection = onValue(ref(database, ".info/connected"), (snapshot) => {
        if (!mountedRef.current) return;
        firebaseConnectedRef.current = snapshot.val() === true;
        if (firebaseConnectedRef.current) {
          void retrySync();
        } else {
          const count = localStateRef.current.pendingOperations.length;
          setSyncState("offline");
          setSyncMessage(
            count
              ? `${navigator.onLine ? "Firebase no ha confirmado conexión" : "Sin internet"} · ${count} cambio${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}`
              : `${navigator.onLine ? "Firebase no ha confirmado conexión" : "Sin internet"} · datos disponibles en este dispositivo`,
          );
        }
      });

      unsubscribeExpenses = onValue(
        ref(database, "expenses"),
        (snapshot) => {
          remoteExpensesRef.current = recordToExpenses(snapshot.val());
          refreshFromRemote();
        },
        (reason) => {
          if (!mountedRef.current) return;
          console.error("[Daily Expenses] Error al cargar gastos compartidos", reason);
          const errorMessage = expenseSyncErrorMessage(reason);
          appendSyncLog("Gastos", "error", `No se pudieron cargar los gastos compartidos. ${errorMessage} Detalle técnico: ${expenseSyncErrorDetails(reason)}`);
          setSyncState("error");
          setSyncMessage(errorMessage);
        },
      );
    } catch (reason) {
      console.error("[Daily Expenses] Error al iniciar sincronización de gastos", reason);
      const errorMessage = expenseSyncErrorMessage(reason);
      appendSyncLog("Gastos", "error", `No se pudo iniciar la sincronización. ${errorMessage} Detalle técnico: ${expenseSyncErrorDetails(reason)}`);
      firebaseConnectedRef.current = false;
      setSyncState("error");
      setSyncMessage(errorMessage);
    }

    return () => {
      mountedRef.current = false;
      firebaseConnectedRef.current = false;
      unsubscribeExpenses?.();
      unsubscribeConnection?.();
    };
  }, [commitState, retrySync]);

  useEffect(() => {
    const retryWhenOnline = () => { void retrySync(); };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") void retrySync();
    };
    window.addEventListener("online", retryWhenOnline);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [retrySync]);

  return {
    expenses: expenses.filter((expense) => !expense.deletedAt),
    syncState,
    syncMessage,
    pendingCount,
    createExpense,
    editExpense,
    deleteExpense,
    restoreExpense,
    retrySync,
  };
};
