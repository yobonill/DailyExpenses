import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, set, update, type Unsubscribe } from "firebase/database";
import { getAuthenticatedFirebaseServices } from "../services/firebase";
import type {
  Expense,
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

const normalizeExpense = (raw: Partial<Expense> & { id: string }): Expense => {
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const occurredDate =
    typeof raw.occurredDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.occurredDate)
      ? raw.occurredDate
      : toLocalDateKey(new Date(raw.occurredAt || createdAt));
  const quantity = Math.max(1, Math.floor(Number(raw.quantity) || 1));
  const unitPriceCents = Math.max(1, Math.round(Number(raw.unitPriceCents) || 1));

  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    unitPriceCents,
    quantity,
    occurredDate,
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : createdAt,
    status: raw.status === "transferred" ? "transferred" : "pending",
    transferredAt: typeof raw.transferredAt === "string" ? raw.transferredAt : undefined,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : undefined,
  };
};

const stripUndefined = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

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
}

export interface UseExpensesResult {
  expenses: Expense[];
  syncState: SyncState;
  syncMessage: string;
  pendingCount: number;
  createExpense: (input: NewExpenseInput) => Promise<Expense>;
  editExpense: (
    expenseId: string,
    changes: Pick<Expense, "name" | "unitPriceCents" | "quantity" | "occurredDate">,
  ) => Promise<void>;
  markTransferred: (expenseIds: string[]) => Promise<void>;
  markPending: (expenseIds: string[]) => Promise<void>;
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
          await set(
            ref(database, `expenses/${operation.expense.id}`),
            stripUndefined(operation.expense),
          );
        } else {
          await update(
            ref(database, `expenses/${operation.expenseId}`),
            stripUndefined(operation.changes),
          );
        }

        removePendingOperation(operation.id);
        return true;
      } catch {
        if (mountedRef.current) {
          setSyncState(navigator.onLine ? "error" : "offline");
          setSyncMessage(
            "Guardado en este dispositivo. La sincronización se reintentará automáticamente.",
          );
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
      setSyncMessage(
        initialCount
          ? `Sin conexión · ${initialCount} cambio${initialCount === 1 ? "" : "s"} pendiente${initialCount === 1 ? "" : "s"}`
          : "Sin conexión · datos disponibles en este dispositivo",
      );
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
        status: "pending",
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
      changes: Pick<Expense, "name" | "unitPriceCents" | "quantity" | "occurredDate">,
    ) => {
      await patchExpense(expenseId, {
        name: changes.name.trim(),
        unitPriceCents: Math.round(changes.unitPriceCents),
        quantity: Math.max(1, Math.floor(changes.quantity)),
        occurredDate: changes.occurredDate,
      });
    },
    [patchExpense],
  );

  const markTransferred = useCallback(
    async (expenseIds: string[]) => {
      const transferredAt = new Date().toISOString();
      for (const expenseId of expenseIds) {
        await patchExpense(expenseId, { status: "transferred", transferredAt });
      }
    },
    [patchExpense],
  );

  const markPending = useCallback(
    async (expenseIds: string[]) => {
      for (const expenseId of expenseIds) {
        await patchExpense(expenseId, { status: "pending", transferredAt: null });
      }
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
              ? `Sin conexión · ${count} cambio${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}`
              : "Sin conexión · datos disponibles en este dispositivo",
          );
        }
      });

      unsubscribeExpenses = onValue(
        ref(database, "expenses"),
        (snapshot) => {
          remoteExpensesRef.current = recordToExpenses(snapshot.val());
          refreshFromRemote();
        },
        () => {
          if (!mountedRef.current) return;
          setSyncState("error");
          setSyncMessage("No se pudieron cargar los gastos compartidos.");
        },
      );
    } catch {
      firebaseConnectedRef.current = false;
      setSyncState("error");
      setSyncMessage("No se pudo conectar con Firebase con esta sesión.");
    }

    return () => {
      mountedRef.current = false;
      firebaseConnectedRef.current = false;
      unsubscribeExpenses?.();
      unsubscribeConnection?.();
    };
  }, [commitState, retrySync]);

  return {
    expenses: expenses.filter((expense) => !expense.deletedAt),
    syncState,
    syncMessage,
    pendingCount,
    createExpense,
    editExpense,
    markTransferred,
    markPending,
    deleteExpense,
    restoreExpense,
    retrySync,
  };
};
