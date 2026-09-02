import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, runTransaction, set, type Unsubscribe } from "firebase/database";
import type { AppUserDefinition } from "../config/appUsers";
import { createId } from "../lib/id";
import {
  FINANCIAL_ROOT_PATH,
  applyFinancialUpdates,
  applyPendingFinancialOperations,
  createEmptyFinancialData,
  normalizeFinancialData,
  readLocalFinancialState,
  storeLocalFinancialState,
} from "../lib/financialState";
import type {
  FinancialData,
  FinancialPendingOperation,
  LocalFinancialState,
  UseFinancialDataResult,
} from "../models/finance";
import { isFinanciallyConsistent, reconcileVersionedUpdates } from "../lib/financialIntegrity";
import { getAuthenticatedFirebaseServices } from "../services/firebase";
import { appendSyncLog } from "../lib/syncLog";

export const toFirebaseCompatibleValue = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const syncErrorMessage = (reason: unknown): string => {
  const code = reason && typeof reason === "object" && "code" in reason
    ? String((reason as { code?: unknown }).code || "")
    : "";
  if (code.toLowerCase().includes("permission-denied") || code.toLowerCase().includes("permission_denied")) {
    return "Firebase rechazó la escritura. Revisa que hayas iniciado sesión y que las reglas publicadas correspondan a Daily Expenses.";
  }
  return code
    ? `No se pudo sincronizar con Firebase (${code}).`
    : "No se pudo sincronizar con Firebase.";
};

const syncErrorDetails = (reason: unknown): string => {
  if (!(reason instanceof Error)) return String(reason || "Error desconocido");
  const code = "code" in reason ? String((reason as Error & { code?: unknown }).code || "") : "";
  return [code, reason.message].filter(Boolean).join(" · ");
};

export const useFinancialData = (user: AppUserDefinition): UseFinancialDataResult => {
  const initial = readLocalFinancialState();
  const [data, setData] = useState(initial.data);
  const [ready, setReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(initial.pendingOperations.length);
  const [syncState, setSyncState] = useState<UseFinancialDataResult["syncState"]>("connecting");
  const [syncMessage, setSyncMessage] = useState("Conectando datos financieros…");

  const localRef = useRef<LocalFinancialState>(initial);
  const remoteRef = useRef<FinancialData>(createEmptyFinancialData());
  const connectedRef = useRef(false);
  const mountedRef = useRef(true);
  const syncingRef = useRef(false);
  const conflictMessageRef = useRef("");

  const commitState = useCallback((next: LocalFinancialState) => {
    storeLocalFinancialState(next);
    localRef.current = next;
    if (mountedRef.current) {
      setData(next.data);
      setPendingCount(next.pendingOperations.length);
    }
  }, []);

  const removePending = useCallback((operationId: string) => {
    const current = localRef.current;
    commitState({
      ...current,
      pendingOperations: current.pendingOperations.filter((item) => item.id !== operationId),
    });
  }, [commitState]);

  const executeOperation = useCallback(async (operation: FinancialPendingOperation): Promise<boolean> => {
    if (!navigator.onLine || !connectedRef.current) return false;
    try {
      setSyncState("saving");
      setSyncMessage("Sincronizando datos financieros…");
      const { database } = getAuthenticatedFirebaseServices();
      let rejected = false;
      if (operation.replaceRoot) {
        await set(ref(database, FINANCIAL_ROOT_PATH), toFirebaseCompatibleValue(operation.replaceRoot));
      } else {
        const result = await runTransaction(ref(database, FINANCIAL_ROOT_PATH), (currentValue) => {
          const current = normalizeFinancialData(currentValue);
          const reconciled = reconcileVersionedUpdates(current, toFirebaseCompatibleValue(operation.updates));
          if (reconciled.conflict) return undefined;
          const candidate = applyFinancialUpdates(current, reconciled.updates);
          return isFinanciallyConsistent(candidate)
            ? toFirebaseCompatibleValue(candidate)
            : undefined;
        }, { applyLocally: false });
        if (!result.committed) {
          rejected = true;
          conflictMessageRef.current = "Otro cambio se guardó primero o el movimiento dejaría datos inconsistentes. Se conservó la versión compartida.";
          remoteRef.current = normalizeFinancialData(result.snapshot.val());
        }
      }
      if (rejected) {
        appendSyncLog("Presupuesto", "error", conflictMessageRef.current);
        const remaining = localRef.current.pendingOperations.filter((item) => item.id !== operation.id);
        commitState({
          data: applyPendingFinancialOperations(remoteRef.current, remaining),
          pendingOperations: remaining,
        });
      } else {
        removePending(operation.id);
      }
      return true;
    } catch (reason) {
      console.error("[Daily Expenses] Error al sincronizar datos financieros", reason);
      const errorMessage = syncErrorMessage(reason);
      appendSyncLog("Presupuesto", "error", `${errorMessage} Detalle técnico: ${syncErrorDetails(reason)}`);
      if (mountedRef.current) {
        setSyncState(navigator.onLine ? "error" : "offline");
        setSyncMessage(`${errorMessage} Guardado localmente; se reintentará.`);
      }
      return false;
    }
  }, [commitState, removePending]);

  const retrySync = useCallback(async () => {
    if (syncingRef.current) return;
    const initialCount = localRef.current.pendingOperations.length;
    if (!navigator.onLine || !connectedRef.current) {
      setSyncState("offline");
      const message = navigator.onLine
        ? "Firebase no ha confirmado conexión. Revisa la sesión o la red y vuelve a intentar."
        : "El dispositivo no tiene conexión a internet.";
      setSyncMessage(`${message} Los datos financieros permanecen en este dispositivo.`);
      if (initialCount > 0) appendSyncLog("Presupuesto", "error", `${message} Pendientes: ${initialCount}.`);
      return;
    }
    syncingRef.current = true;
    try {
      while (connectedRef.current && navigator.onLine) {
        const operation = localRef.current.pendingOperations[0];
        if (!operation || !(await executeOperation(operation))) break;
      }
    } finally {
      syncingRef.current = false;
    }
    if (!localRef.current.pendingOperations.length && mountedRef.current) {
      if (conflictMessageRef.current) {
        setSyncState("error");
        setSyncMessage(conflictMessageRef.current);
        conflictMessageRef.current = "";
      } else {
        setSyncState("synced");
        setSyncMessage("Sincronizado");
        if (initialCount > 0) appendSyncLog("Presupuesto", "success", `${initialCount} cambio${initialCount === 1 ? "" : "s"} sincronizado${initialCount === 1 ? "" : "s"} correctamente.`);
      }
    }
  }, [executeOperation]);

  const queueOperation = useCallback(async (operation: FinancialPendingOperation) => {
    const current = localRef.current;
    const nextData = operation.replaceRoot
      ? normalizeFinancialData(operation.replaceRoot)
      : applyFinancialUpdates(current.data, operation.updates);
    commitState({
      data: nextData,
      pendingOperations: [...current.pendingOperations, operation],
    });
    if (!navigator.onLine || !connectedRef.current) {
      setSyncState("offline");
      setSyncMessage("Guardado en este dispositivo · pendiente de sincronizar");
      return;
    }
    void retrySync();
  }, [commitState, retrySync]);

  const commitUpdates = useCallback(async (updates: Record<string, unknown>) => {
    if (!Object.keys(updates).length) return;
    await queueOperation({
      id: createId(),
      createdAt: new Date().toISOString(),
      updates,
    });
  }, [queueOperation]);

  const replaceData = useCallback(async (replacement: FinancialData) => {
    await queueOperation({
      id: createId(),
      createdAt: new Date().toISOString(),
      updates: {},
      replaceRoot: normalizeFinancialData(replacement),
    });
  }, [queueOperation]);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribeData: Unsubscribe | undefined;
    let unsubscribeConnection: Unsubscribe | undefined;
    const { database } = getAuthenticatedFirebaseServices();

    const refresh = () => {
      const current = localRef.current;
      commitState({
        data: applyPendingFinancialOperations(remoteRef.current, current.pendingOperations),
        pendingOperations: current.pendingOperations,
      });
      setReady(true);
      if (!current.pendingOperations.length) {
        setSyncState("synced");
        setSyncMessage("Sincronizado");
      }
    };

    unsubscribeConnection = onValue(ref(database, ".info/connected"), (snapshot) => {
      connectedRef.current = snapshot.val() === true;
      if (connectedRef.current) void retrySync();
      else {
        setSyncState("offline");
        setSyncMessage(navigator.onLine
          ? "Firebase no ha confirmado conexión · datos financieros disponibles en este dispositivo"
          : "Sin internet · datos financieros disponibles en este dispositivo");
      }
    });

    unsubscribeData = onValue(
      ref(database, FINANCIAL_ROOT_PATH),
      (snapshot) => {
        if (!snapshot.exists()) {
          const initialData = normalizeFinancialData(localRef.current.data);
          remoteRef.current = initialData;
          if (!localRef.current.pendingOperations.length) {
            void set(ref(database, FINANCIAL_ROOT_PATH), toFirebaseCompatibleValue(initialData));
          }
        } else {
          remoteRef.current = normalizeFinancialData(snapshot.val());
        }
        refresh();
      },
      (reason) => {
        console.error("[Daily Expenses] Error al cargar datos financieros", reason);
        const errorMessage = syncErrorMessage(reason);
        appendSyncLog("Presupuesto", "error", `No se pudieron cargar los datos financieros compartidos. ${errorMessage} Detalle técnico: ${syncErrorDetails(reason)}`);
        setReady(true);
        setSyncState("error");
        setSyncMessage(errorMessage);
      },
    );

    return () => {
      mountedRef.current = false;
      connectedRef.current = false;
      unsubscribeData?.();
      unsubscribeConnection?.();
    };
  }, [commitState, retrySync, user.uid]);

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

  return { data, ready, syncState, syncMessage, pendingCount, commitUpdates, replaceData, retrySync };
};
