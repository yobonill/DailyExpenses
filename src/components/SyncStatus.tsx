import type { SyncState } from "../models/expense";

interface SyncStatusProps {
  state: SyncState;
  message: string;
  pendingCount: number;
  onRetry: () => void;
}

export function SyncStatus({ state, message, pendingCount, onRetry }: SyncStatusProps) {
  const retryable = state === "error" || state === "offline";
  const label = pendingCount > 0 && state === "synced" ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` : message;

  return (
    <button
      type="button"
      className={`sync-chip sync-${state}`}
      onClick={retryable ? onRetry : undefined}
      title={retryable ? `${label}. Toca para reintentar.` : label}
    >
      <span className="sync-dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
