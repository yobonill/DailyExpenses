import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";
import { LoginScreen } from "./components/LoginScreen";
import { CaptureView } from "./components/CaptureView";
import { ReviewView } from "./components/ReviewView";
import { SyncStatus } from "./components/SyncStatus";
import { useAuth } from "./hooks/useAuth";
import { useExpenses } from "./hooks/useExpenses";
import { usePwaInstall } from "./hooks/usePwaInstall";

type View = "capture" | "review";

interface NoticeState {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

function AuthenticatedApp({ onLogout }: { onLogout: () => Promise<void> }) {
  const [view, setView] = useState<View>("capture");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const {
    expenses,
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
  } = useExpenses();
  const { canInstall, install } = usePwaInstall();

  const pendingExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "pending").length,
    [expenses],
  );

  const showNotice = useCallback(
    (message: string, actionLabel?: string, action?: () => void) => {
      setNotice({ id: Date.now(), message, actionLabel, action });
    },
    [],
  );

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.action ? 6500 : 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const handleInstall = async () => {
    const result = await install();
    if (result === "ios-instructions") {
      showNotice("En iPhone/iPad: Compartir → Añadir a pantalla de inicio");
    } else if (result === "browser-instructions") {
      showNotice("Usa la opción “Instalar aplicación” o “Añadir a pantalla de inicio” del navegador.");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="compact-brand" type="button" onClick={() => setView("capture")} aria-label="Ir a registrar gasto">
          <span className="compact-brand-mark" aria-hidden="true">$</span>
          <span>Gastos Extras</span>
        </button>
        <SyncStatus
          state={syncState}
          message={syncMessage}
          pendingCount={pendingCount}
          onRetry={() => void retrySync()}
        />
      </header>

      <main className="app-content">
        {view === "capture" ? (
          <CaptureView
            onCreate={createExpense}
            onSaved={() => showNotice("Gasto guardado")}
          />
        ) : (
          <ReviewView
            expenses={expenses}
            onEdit={editExpense}
            onTransfer={markTransferred}
            onPending={markPending}
            onDelete={deleteExpense}
            onRestore={restoreExpense}
            onNotice={showNotice}
          />
        )}
      </main>

      {view === "review" && (
        <footer className="utility-footer">
          {canInstall && (
            <button type="button" onClick={() => void handleInstall()}>Instalar aplicación</button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("¿Cerrar la sesión guardada en este dispositivo?")) void onLogout();
            }}
          >
            Cerrar sesión en este dispositivo
          </button>
        </footer>
      )}

      <nav className="bottom-nav" aria-label="Navegación principal">
        <button type="button" className={view === "capture" ? "active" : ""} onClick={() => setView("capture")}>
          <span className="nav-icon" aria-hidden="true">＋</span>
          <span>Registrar</span>
        </button>
        <button type="button" className={view === "review" ? "active" : ""} onClick={() => setView("review")}>
          <span className="nav-icon" aria-hidden="true">≡</span>
          <span>Revisar</span>
          {pendingExpenses > 0 && <span className="nav-badge">{pendingExpenses > 99 ? "99+" : pendingExpenses}</span>}
        </button>
      </nav>

      {notice && (
        <div className="snackbar" role="status" key={notice.id}>
          <span>{notice.message}</span>
          {notice.action && notice.actionLabel && (
            <button
              type="button"
              onClick={() => {
                notice.action?.();
                setNotice(null);
              }}
            >
              {notice.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, status, error, login, logout } = useAuth();

  if (status === "loading") {
    return (
      <main className="splash-screen">
        <div className="brand-icon" aria-hidden="true">$</div>
        <p>Cargando Gastos Extras…</p>
      </main>
    );
  }

  if (!user || status === "unauthenticated" || status === "authenticating" || status === "error") {
    return (
      <LoginScreen
        loading={status === "authenticating"}
        error={error}
        onLogin={login}
      />
    );
  }

  return <AuthenticatedApp onLogout={logout} />;
}
