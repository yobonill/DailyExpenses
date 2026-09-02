export type SyncLogSource = "Gastos" | "Presupuesto" | "Sistema";
export type SyncLogLevel = "info" | "success" | "error";

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  source: SyncLogSource;
  level: SyncLogLevel;
  message: string;
}

const SYNC_LOG_KEY = "dailyExpenses.syncLog.v1";
export const SYNC_LOG_EVENT = "daily-expenses-sync-log-updated";
const MAX_LOG_ENTRIES = 100;

export const readSyncLog = (): SyncLogEntry[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SyncLogEntry => Boolean(
      entry
      && typeof entry === "object"
      && typeof (entry as SyncLogEntry).id === "string"
      && typeof (entry as SyncLogEntry).timestamp === "string"
      && typeof (entry as SyncLogEntry).message === "string",
    )).slice(0, MAX_LOG_ENTRIES);
  } catch {
    return [];
  }
};

export const appendSyncLog = (
  source: SyncLogSource,
  level: SyncLogLevel,
  message: string,
): void => {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;
  const entry: SyncLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    source,
    level,
    message: normalizedMessage.slice(0, 1000),
  };
  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify([entry, ...readSyncLog()].slice(0, MAX_LOG_ENTRIES)));
    window.dispatchEvent(new Event(SYNC_LOG_EVENT));
  } catch {
    // The log is diagnostic only and must never block a financial operation.
  }
};

export const clearSyncLog = (): void => {
  try {
    localStorage.removeItem(SYNC_LOG_KEY);
    window.dispatchEvent(new Event(SYNC_LOG_EVENT));
  } catch {
    // Ignore storage failures; synchronization remains authoritative.
  }
};
