import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";
import { LoginScreen } from "./components/LoginScreen";
import { CaptureView } from "./components/CaptureView";
import { ReviewView } from "./components/ReviewView";
import { SyncStatus } from "./components/SyncStatus";
import { BudgetView } from "./components/finance/BudgetView";
import { CreditCardsView } from "./components/finance/CreditCardsView";
import { DashboardView } from "./components/finance/DashboardView";
import { FinanceReportView } from "./components/finance/FinanceReportView";
import { FutureExpensesView } from "./components/finance/FutureExpensesView";
import { IncomeView } from "./components/finance/IncomeView";
import { PurchaseGoalsView } from "./components/finance/PurchaseGoalsView";
import { SavingsView } from "./components/finance/SavingsView";
import { SettingsView } from "./components/finance/SettingsView";
import { useAuth } from "./hooks/useAuth";
import { useExpenses } from "./hooks/useExpenses";
import { useFinancialData } from "./hooks/useFinancialData";
import { useFinanceActions } from "./hooks/useFinanceActions";
import { usePwaInstall } from "./hooks/usePwaInstall";
import type { AppUserDefinition } from "./config/appUsers";
import type { PurchaseGoal } from "./models/finance";

type View = "capture" | "review" | "dashboard" | "budget" | "future" | "goals" | "savings" | "income" | "cards" | "reports" | "settings" | "more";

interface NoticeState {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

const overflowViews: View[] = ["future", "goals", "savings", "income", "cards", "reports", "settings", "more"];

function MoreView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const items: Array<{ view: View; icon: string; title: string; text: string }> = [
    { view: "future", icon: "◷", title: "Gastos no mensuales", text: "Seguros, renovaciones y próximos 12 meses" },
    { view: "goals", icon: "☆", title: "Metas de compra", text: "Compras deseadas sin fecha ni impacto en proyecciones" },
    { view: "savings", icon: "◎", title: "Ahorros", text: "Fondos, movimientos y dinero reservado" },
    { view: "income", icon: "↓", title: "Ingresos", text: "Salarios, otros ingresos y valores recibidos" },
    { view: "cards", icon: "▰", title: "Tarjetas", text: "Deuda DOP/USD, cortes, estados y pagos" },
    { view: "reports", icon: "▥", title: "Reportes", text: "Gastos, flujo, planificación y Excel" },
    { view: "settings", icon: "⚙", title: "Configuración", text: "Avisos, respaldo, restauración y app" },
  ];
  return <section className="finance-page"><div className="finance-heading"><div><span className="eyebrow">Todas las áreas</span><h1>Más</h1></div></div><div className="more-grid">{items.map((item) => <button key={item.view} type="button" onClick={() => onNavigate(item.view)}><span className="more-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.text}</small></span><b aria-hidden="true">›</b></button>)}</div></section>;
}

function AuthenticatedApp({ user, onLogout }: { user: AppUserDefinition; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<View>("capture");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const expensesState = useExpenses();
  const financial = useFinancialData(user);
  const actions = useFinanceActions({ data: financial.data, user, commitUpdates: financial.commitUpdates });
  const generateRecurring = actions.generateRecurring;
  const { canInstall, install } = usePwaInstall();

  const pendingExpenses = useMemo(
    () => expensesState.expenses.filter((expense) => expense.status === "pending").length,
    [expensesState.expenses],
  );

  const showNotice = useCallback((message: string, actionLabel?: string, action?: () => void) => {
    setNotice({ id: Date.now(), message, actionLabel, action });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.action ? 6500 : 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!financial.ready) return;
    void generateRecurring();
  }, [financial.ready, generateRecurring]);

  useEffect(() => {
    const refresh = () => { if (financial.ready) void generateRecurring(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [financial.ready, generateRecurring]);

  const handleInstall = async () => {
    const result = await install();
    if (result === "ios-instructions") showNotice("En iPhone/iPad: Compartir → Añadir a pantalla de inicio");
    else if (result === "browser-instructions") showNotice("Usa “Instalar aplicación” o “Añadir a pantalla de inicio” del navegador.");
  };

  const handlePurchaseGoalCash = async (
    goal: PurchaseGoal,
    actualAmountMinor: number,
    actualPaymentDopMinor: number,
    date: string,
  ) => {
    const expense = await expensesState.createExpense({
      name: goal.name,
      unitPriceCents: actualPaymentDopMinor,
      quantity: 1,
      occurredDate: date,
    });
    try {
      await expensesState.markTransferred([expense.id]);
      await actions.purchaseGoalWithCash(goal.id, actualAmountMinor, actualPaymentDopMinor, date, expense.id);
    } catch (reason) {
      await expensesState.deleteExpense(expense.id);
      throw reason;
    }
  };

  const combinedSync = financial.pendingCount > 0 || financial.syncState === "error" || financial.syncState === "offline"
    ? { state: financial.syncState, message: financial.syncMessage, count: financial.pendingCount + expensesState.pendingCount, retry: financial.retrySync }
    : { state: expensesState.syncState, message: expensesState.syncMessage, count: expensesState.pendingCount, retry: expensesState.retrySync };

  const renderView = () => {
    switch (view) {
      case "capture": return <CaptureView onCreate={expensesState.createExpense} onSaved={() => showNotice("Gasto guardado")} />;
      case "review": return <ReviewView expenses={expensesState.expenses} onEdit={expensesState.editExpense} onTransfer={expensesState.markTransferred} onPending={expensesState.markPending} onDelete={expensesState.deleteExpense} onRestore={expensesState.restoreExpense} onNotice={showNotice} />;
      case "dashboard": return <DashboardView data={financial.data} expenses={expensesState.expenses} onPay={(value) => actions.payObligation(value)} onNavigate={setView} />;
      case "budget": return <BudgetView data={financial.data} onSaveTemplate={actions.saveMonthlyTemplate} onArchiveTemplate={actions.archiveMonthlyTemplate} onCreateOneTime={actions.createOneTimeMonthly} onPay={(value) => actions.payObligation(value)} onReopen={(id) => actions.reopenObligation("monthly", id)} onCancel={actions.cancelMonthlyOccurrence} />;
      case "income": return <IncomeView data={financial.data} onSaveTemplate={actions.saveIncomeTemplate} onCreateOneTime={actions.createOneTimeIncome} onReceive={actions.receiveIncome} onReopen={actions.reopenIncome} />;
      case "future": return <FutureExpensesView data={financial.data} onSave={actions.saveNonMonthly} onPay={(value) => actions.payObligation(value)} onReopen={(id) => actions.reopenObligation("nonMonthly", id)} onAllocate={actions.allocateSavings} />;
      case "goals": return <PurchaseGoalsView data={financial.data} onSave={actions.savePurchaseGoal} onAllocate={actions.allocatePurchaseGoalSavings} onSchedule={actions.schedulePurchaseGoal} onPurchaseCash={handlePurchaseGoalCash} onPurchaseCard={actions.purchaseGoalWithCard} onDiscard={actions.discardPurchaseGoal} onRelease={actions.releaseAllocation} />;
      case "savings": return <SavingsView data={financial.data} onSave={actions.saveSavingsFund} onAddTransaction={actions.addSavingsTransaction} onTransfer={actions.transferSavings} onRelease={actions.releaseAllocation} />;
      case "cards": return <CreditCardsView data={financial.data} expenses={expensesState.expenses} onSaveCard={actions.saveCreditCard} onAddTransaction={actions.addCardTransaction} onReverseTransaction={actions.reverseCardTransaction} />;
      case "reports": return <FinanceReportView data={financial.data} expenses={expensesState.expenses} onMarkRegistered={expensesState.markTransferred} />;
      case "settings": return <SettingsView data={financial.data} expenses={expensesState.expenses} syncPendingCount={financial.pendingCount + expensesState.pendingCount} onUpdateSettings={actions.updateSettings} onRecordBackup={(timestamp) => financial.commitUpdates({ lastBackupAt: timestamp })} canInstall={canInstall} onInstall={handleInstall} onLogout={onLogout} />;
      default: return <MoreView onNavigate={setView} />;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="compact-brand" type="button" onClick={() => setView("capture")} aria-label="Ir a registrar gasto"><span className="compact-brand-mark" aria-hidden="true">$</span><span>Gastos & Presupuesto</span></button>
        <SyncStatus state={combinedSync.state} message={combinedSync.message} pendingCount={combinedSync.count} onRetry={() => void combinedSync.retry()} />
      </header>
      <main className="app-content">{renderView()}</main>
      <nav className="bottom-nav expanded-nav" aria-label="Navegación principal">
        <button type="button" className={view === "capture" ? "active" : ""} onClick={() => setView("capture")}><span className="nav-icon" aria-hidden="true">＋</span><span>Registrar</span></button>
        <button type="button" className={view === "review" ? "active" : ""} onClick={() => setView("review")}><span className="nav-icon" aria-hidden="true">≡</span><span>Revisar</span>{pendingExpenses > 0 && <span className="nav-badge">{pendingExpenses > 99 ? "99+" : pendingExpenses}</span>}</button>
        <button type="button" className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><span className="nav-icon" aria-hidden="true">◇</span><span>Dashboard</span></button>
        <button type="button" className={view === "budget" ? "active" : ""} onClick={() => setView("budget")}><span className="nav-icon" aria-hidden="true">▤</span><span>Presupuesto</span></button>
        <button type="button" className={overflowViews.includes(view) ? "active" : ""} onClick={() => setView("more")}><span className="nav-icon" aria-hidden="true">•••</span><span>Más</span></button>
      </nav>
      {notice && <div className="snackbar" role="status" key={notice.id}><span>{notice.message}</span>{notice.action && notice.actionLabel && <button type="button" onClick={() => { notice.action?.(); setNotice(null); }}>{notice.actionLabel}</button>}</div>}
    </div>
  );
}

export default function App() {
  const { user, status, error, login, logout } = useAuth();
  if (status === "loading") return <main className="splash-screen"><div className="brand-icon" aria-hidden="true">$</div><p>Cargando Gastos & Presupuesto…</p></main>;
  if (!user || status === "unauthenticated" || status === "authenticating" || status === "error") return <LoginScreen loading={status === "authenticating"} error={error} onLogin={login} />;
  return <AuthenticatedApp user={user} onLogout={logout} />;
}
