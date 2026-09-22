import { useCallback, useEffect, useRef, useState } from "react";
import { onValue, ref, runTransaction, set, type Unsubscribe } from "firebase/database";
import type { AppUserDefinition } from "../config/appUsers";
import { createId } from "../lib/id";
import {
  FINANCIAL_ROOT_PATH,
  applyFinancialUpdates,
  applyPendingFinancialOperations,
  createEmptyFinancialData,
  migratePendingFinancialOperation,
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
import { prepareReviewedUpdates } from "../lib/reviewedUpdates";

export const toFirebaseCompatibleValue = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const syncErrorCode = (reason: unknown): string =>
  reason && typeof reason === "object" && "code" in reason
    ? String((reason as { code?: unknown }).code || "")
    : "";

const syncErrorMessage = (reason: unknown): string => {
  const code = syncErrorCode(reason);
  const normalized = code.toLowerCase();
  if (normalized.includes("permission-denied") || normalized.includes("permission_denied")) {
    return "Firebase rechazó la escritura. Revisa que hayas iniciado sesión y que las reglas publicadas correspondan a Daily Expenses.";
  }
  if (normalized.includes("auth") || normalized.includes("token")) {
    return "La sesión de Firebase no es válida. Cierra sesión, vuelve a entrar y reintenta.";
  }
  return code
    ? `No se pudo sincronizar con Firebase (${code}).`
    : "No se pudo sincronizar con Firebase.";
};

const syncErrorDetails = (reason: unknown): string => {
  if (!(reason instanceof Error)) return String(reason || "Error desconocido");
  const code = syncErrorCode(reason);
  return [code, reason.message].filter(Boolean).join(" · ");
};

export const isRetryableFinancialSyncError = (reason: unknown): boolean => {
  if (!navigator.onLine) return true;
  const code = syncErrorCode(reason).toLowerCase();
  const message = reason instanceof Error ? reason.message.toLowerCase() : String(reason || "").toLowerCase();
  const combined = `${code} ${message}`;
  return [
    "network",
    "unavailable",
    "disconnected",
    "connection",
    "timeout",
    "offline",
    "fetch failed",
  ].some((needle) => combined.includes(needle));
};

interface UseFinancialDataOptions {
  offlineOnly?: boolean;
}

type OperationResult = "success" | "retryable-error" | "blocked";

export const useFinancialData = (
  user: AppUserDefinition,
  { offlineOnly = false }: UseFinancialDataOptions = {},
): UseFinancialDataResult => {
  const initial = readLocalFinancialState();
  const [data, setData] = useState(initial.data);
  const [ready, setReady] = useState(offlineOnly);
  const [pendingOperations, setPendingOperations] = useState(initial.pendingOperations);
  const [syncState, setSyncState] = useState<UseFinancialDataResult["syncState"]>(offlineOnly ? "offline" : "connecting");
  const [syncMessage, setSyncMessage] = useState(offlineOnly
    ? "Modo sin conexión · los cambios se guardarán en este dispositivo"
    : "Conectando datos financieros…");
  const [canDiscardPendingChanges, setCanDiscardPendingChanges] = useState(false);

  const localRef = useRef<LocalFinancialState>(initial);
  const remoteRef = useRef<FinancialData>(createEmptyFinancialData());
  const connectedRef = useRef(false);
  const remoteLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const syncingRef = useRef(false);
  const conflictMessageRef = useRef("");

  const commitState = useCallback((next: LocalFinancialState) => {
    storeLocalFinancialState(next);
    localRef.current = next;
    if (mountedRef.current) {
      setData(next.data);
      setPendingOperations(next.pendingOperations);
    }
  }, []);

  const removePending = useCallback((operationId: string) => {
    const current = localRef.current;
    commitState({
      ...current,
      pendingOperations: current.pendingOperations.filter((item) => item.id !== operationId),
    });
  }, [commitState]);

  const markBlocked = useCallback((operation: FinancialPendingOperation, reason: unknown) => {
    const technical = syncErrorDetails(reason);
    const userMessage = syncErrorMessage(reason);
    const now = new Date().toISOString();
    const current = localRef.current;
    commitState({
      ...current,
      pendingOperations: current.pendingOperations.map((item) => item.id === operation.id
        ? { ...item, status: "blocked", blockedAt: now, lastError: technical || userMessage }
        : item),
    });
    appendSyncLog("Presupuesto", "error", `${userMessage} El cambio quedó bloqueado para evitar reintentos infinitos. Detalle técnico: ${technical}`);
    if (mountedRef.current) {
      setSyncState("error");
      setSyncMessage("Hay un cambio financiero bloqueado. Revisa Configuración → Diagnóstico de sincronización.");
    }
  }, [commitState]);

  const executeOperation = useCallback(async (
    rawOperation: FinancialPendingOperation,
    forceBlocked = false,
  ): Promise<OperationResult> => {
    if (offlineOnly || !navigator.onLine || !connectedRef.current) return "retryable-error";
    const operation = migratePendingFinancialOperation(rawOperation);
    if (operation.status === "blocked" && !forceBlocked) return "blocked";

    // Persist local migration before retrying an operation created by v2.2.0.
    if (JSON.stringify(operation) !== JSON.stringify(rawOperation)) {
      const current = localRef.current;
      commitState({
        ...current,
        pendingOperations: current.pendingOperations.map((item) => item.id === operation.id ? operation : item),
      });
    }

    try {
      setSyncState("saving");
      setSyncMessage("Sincronizando datos financieros…");
      const { database } = getAuthenticatedFirebaseServices();
      let rejected = false;
      if (operation.replaceRoot) {
        await set(ref(database, FINANCIAL_ROOT_PATH), toFirebaseCompatibleValue(operation.replaceRoot));
        remoteRef.current = normalizeFinancialData(operation.replaceRoot);
        remoteLoadedRef.current = true;
        if (mountedRef.current) setCanDiscardPendingChanges(true);
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
          remoteLoadedRef.current = true;
          if (mountedRef.current) setCanDiscardPendingChanges(true);
        } else {
          remoteRef.current = normalizeFinancialData(result.snapshot.val());
          remoteLoadedRef.current = true;
          if (mountedRef.current) setCanDiscardPendingChanges(true);
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
      return "success";
    } catch (reason) {
      console.error("[Daily Expenses] Error al sincronizar datos financieros", reason);
      const errorMessage = syncErrorMessage(reason);
      const technical = syncErrorDetails(reason);
      if (isRetryableFinancialSyncError(reason)) {
        appendSyncLog("Presupuesto", "error", `${errorMessage} Se reintentará automáticamente. Detalle técnico: ${technical}`);
        if (mountedRef.current) {
          setSyncState(navigator.onLine ? "error" : "offline");
          setSyncMessage(`${errorMessage} Guardado localmente; se reintentará cuando vuelva la conexión.`);
        }
        return "retryable-error";
      }
      markBlocked(operation, reason);
      return "blocked";
    }
  }, [commitState, markBlocked, offlineOnly, removePending]);

  const syncQueue = useCallback(async (forceBlocked: boolean) => {
    if (syncingRef.current) return;
    const initialCount = localRef.current.pendingOperations.length;
    if (offlineOnly || !navigator.onLine || !connectedRef.current) {
      setSyncState("offline");
      const message = offlineOnly
        ? "Modo sin conexión activo."
        : navigator.onLine
          ? "Firebase no ha confirmado conexión. Revisa la sesión o la red y vuelve a intentar."
          : "El dispositivo no tiene conexión a internet.";
      setSyncMessage(`${message} Los datos financieros permanecen en este dispositivo.`);
      if (initialCount > 0) appendSyncLog("Presupuesto", "info", `${message} Pendientes: ${initialCount}.`);
      return;
    }
    if (!initialCount) {
      setSyncState("synced");
      setSyncMessage("Sincronizado");
      return;
    }

    syncingRef.current = true;
    try {
      while (connectedRef.current && navigator.onLine && !offlineOnly) {
        const operation = localRef.current.pendingOperations[0];
        if (!operation) break;
        if (operation.status === "blocked" && !forceBlocked) {
          setSyncState("error");
          setSyncMessage("Hay un cambio financiero bloqueado. Revisa Configuración → Diagnóstico de sincronización.");
          break;
        }
        const result = await executeOperation(operation, forceBlocked);
        if (result !== "success") break;
        forceBlocked = false;
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
  }, [executeOperation, offlineOnly]);

  const retrySync = useCallback(async () => {
    await syncQueue(true);
  }, [syncQueue]);

  const autoRetrySync = useCallback(async () => {
    await syncQueue(false);
  }, [syncQueue]);

  const discardPendingChanges = useCallback((): number => {
    const count = localRef.current.pendingOperations.length;
    if (!count || !remoteLoadedRef.current) return 0;
    commitState({ data: remoteRef.current, pendingOperations: [] });
    appendSyncLog("Presupuesto", "info", `${count} cambio${count === 1 ? "" : "s"} financiero${count === 1 ? "" : "s"} local${count === 1 ? "" : "es"} descartado${count === 1 ? "" : "s"}.`);
    if (connectedRef.current && navigator.onLine && !offlineOnly) {
      setSyncState("synced");
      setSyncMessage("Sincronizado");
    } else {
      setSyncState("offline");
      setSyncMessage("Cambios locales descartados · datos compartidos conservados en este dispositivo");
    }
    return count;
  }, [commitState, offlineOnly]);

  const queueOperation = useCallback(async (rawOperation: FinancialPendingOperation) => {
    const operation = migratePendingFinancialOperation({ ...rawOperation, status: rawOperation.status || "pending" });
    const current = localRef.current;
    const nextData = operation.replaceRoot
      ? normalizeFinancialData(operation.replaceRoot)
      : applyFinancialUpdates(current.data, operation.updates);
    commitState({
      data: nextData,
      pendingOperations: [...current.pendingOperations, operation],
    });
    if (offlineOnly || !navigator.onLine || !connectedRef.current) {
      setSyncState("offline");
      setSyncMessage("Guardado en este dispositivo · pendiente de sincronizar");
      return;
    }
    void autoRetrySync();
  }, [autoRetrySync, commitState, offlineOnly]);

  const commitUpdates = useCallback(async (updates: Record<string, unknown>) => {
    if (!Object.keys(updates).length) return;
    const reviewed = prepareReviewedUpdates(localRef.current.data, updates, user.uid, {
      warn: message => window.alert(message), confirm: message => window.confirm(message),
    });
    await queueOperation({
      id: createId(),
      createdAt: new Date().toISOString(),
      updates: reviewed,
      status: "pending",
    });
  }, [queueOperation, user.uid]);

  const replaceData = useCallback(async (replacement: FinancialData) => {
    await queueOperation({
      id: createId(),
      createdAt: new Date().toISOString(),
      updates: {},
      replaceRoot: normalizeFinancialData(replacement),
      status: "pending",
    });
  }, [queueOperation]);

  useEffect(() => {
    mountedRef.current = true;
    if (offlineOnly) {
      connectedRef.current = false;
      remoteLoadedRef.current = false;
      setCanDiscardPendingChanges(false);
      setReady(true);
      setSyncState("offline");
      setSyncMessage(localRef.current.pendingOperations.length
        ? `Modo sin conexión · ${localRef.current.pendingOperations.length} cambio${localRef.current.pendingOperations.length === 1 ? "" : "s"} pendiente${localRef.current.pendingOperations.length === 1 ? "" : "s"}`
        : "Modo sin conexión · datos disponibles en este dispositivo");
      return () => { mountedRef.current = false; };
    }

    let unsubscribeData: Unsubscribe | undefined;
    let unsubscribeConnection: Unsubscribe | undefined;
    let database: ReturnType<typeof getAuthenticatedFirebaseServices>["database"];
    try {
      database = getAuthenticatedFirebaseServices().database;
    } catch (reason) {
      setReady(true);
      setSyncState("error");
      setSyncMessage(syncErrorMessage(reason));
      return () => { mountedRef.current = false; };
    }

    const refresh = () => {
      const current = localRef.current;
      remoteLoadedRef.current = true;
      setCanDiscardPendingChanges(true);
      commitState({
        data: applyPendingFinancialOperations(remoteRef.current, current.pendingOperations),
        pendingOperations: current.pendingOperations,
      });
      setReady(true);
      if (!current.pendingOperations.length) {
        setSyncState("synced");
        setSyncMessage("Sincronizado");
      } else if (current.pendingOperations.some((item) => item.status === "blocked")) {
        setSyncState("error");
        setSyncMessage("Hay un cambio financiero bloqueado. Revisa Configuración → Diagnóstico de sincronización.");
      }
    };

    unsubscribeConnection = onValue(ref(database, ".info/connected"), (snapshot) => {
      connectedRef.current = snapshot.val() === true;
      if (connectedRef.current) void autoRetrySync();
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
        setSyncState(navigator.onLine ? "error" : "offline");
        setSyncMessage(navigator.onLine ? errorMessage : "Sin internet · usando los datos guardados en este dispositivo");
      },
    );

    return () => {
      mountedRef.current = false;
      connectedRef.current = false;
      unsubscribeData?.();
      unsubscribeConnection?.();
    };
  }, [autoRetrySync, commitState, offlineOnly, user.uid]);

  useEffect(() => {
    const retryWhenOnline = () => { if (!offlineOnly) void autoRetrySync(); };
    const retryWhenVisible = () => {
      if (!offlineOnly && document.visibilityState === "visible") void autoRetrySync();
    };
    window.addEventListener("online", retryWhenOnline);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [autoRetrySync, offlineOnly]);

  const blockedCount = pendingOperations.filter((item) => item.status === "blocked").length;
  return {
    data,
    ready,
    syncState,
    syncMessage,
    pendingCount: pendingOperations.length,
    blockedCount,
    pendingOperations,
    canDiscardPendingChanges,
    commitUpdates,
    replaceData,
    retrySync,
    discardPendingChanges,
  };
};
