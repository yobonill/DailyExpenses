import type { SyncState } from "../models/expense";

interface SyncStatusProps {
  state: SyncState;
  message: string;
  pendingCount: number;
  onRetry: () => void;
}

export function SyncStatus({ state, message, pendingCount, onRetry }: SyncStatusProps) {
  const retryable = state === "error" || state === "offline" || pendingCount > 0;
  const label = pendingCount > 0
    ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} · Sincronizar`
    : state === "synced"
      ? "Sincronizado"
      : state === "saving"
        ? "Sincronizando…"
        : state === "connecting"
          ? "Conectando…"
          : state === "offline"
            ? "Sin conexión"
            : "Error de sincronización";

  return (
    <button
      type="button"
      className={`sync-chip sync-${state}`}
      onClick={retryable ? onRetry : undefined}
      title={retryable ? `${message} Toca para reintentar.` : message}
    >
      <span className="sync-dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
