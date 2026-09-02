import { useCallback, useEffect, useState } from "react";
import { SYNC_LOG_EVENT, clearSyncLog, readSyncLog, type SyncLogEntry } from "../lib/syncLog";

export const useSyncLog = (): { entries: SyncLogEntry[]; clear: () => void } => {
  const [entries, setEntries] = useState<SyncLogEntry[]>(readSyncLog);

  useEffect(() => {
    const refresh = () => setEntries(readSyncLog());
    window.addEventListener(SYNC_LOG_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SYNC_LOG_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const clear = useCallback(() => {
    clearSyncLog();
    setEntries([]);
  }, []);

  return { entries, clear };
};
