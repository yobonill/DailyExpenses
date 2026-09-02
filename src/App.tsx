import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Expense, ExpenseEditableFields, SyncState } from "./models/expense";
import type { NewExpenseInput } from "./hooks/useExpenses";
import { appendSyncLog } from "./lib/syncLog";

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
    { view: "reports", icon: "▥", title: "Reportes", text: "Gastos, flujo de caja y planificación" },
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
  const latestActionsRef = useRef(actions);
  latestActionsRef.current = actions;
  const generateRecurring = actions.generateRecurring;
  const { canInstall, install } = usePwaInstall();

  const activeCard = useMemo(
    () => Object.values(financial.data.creditCards).find((card) => card.active && !card.archivedAt),
    [financial.data.creditCards],
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

  const handleCreateExpense = async (input: NewExpenseInput) => {
    const expense = await expensesState.createExpense(input);
    try {
      await actions.syncDailyExpenseCardCharge(expense);
      return expense;
    } catch (reason) {
      await expensesState.deleteExpense(expense.id);
      throw reason;
    }
  };

  const handleEditExpense = async (expenseId: string, changes: ExpenseEditableFields) => {
    const existing = expensesState.expenses.find((expense) => expense.id === expenseId);
    if (!existing) throw new Error("El gasto ya no está disponible.");
    const updated: Expense = { ...existing, ...changes };
    await expensesState.editExpense(expenseId, changes);
    try {
      await actions.syncDailyExpenseCardCharge(updated);
    } catch (reason) {
      await expensesState.editExpense(expenseId, {
        name: existing.name,
        unitPriceCents: existing.unitPriceCents,
        quantity: existing.quantity,
        occurredDate: existing.occurredDate,
        category: existing.category,
        currency: existing.currency || "DOP",
        paymentMethod: existing.paymentMethod || "cash",
      });
      throw reason;
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    await actions.removeDailyExpenseCardCharge(expenseId);
    await expensesState.deleteExpense(expenseId);
  };

  const handleRestoreExpense = useCallback(async (expense: Expense) => {
    await expensesState.restoreExpense(expense.id);
    await latestActionsRef.current.syncDailyExpenseCardCharge(expense);
  }, [expensesState.restoreExpense]);

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
      currency: "DOP",
      paymentMethod: "cash",
    });
    try {
      await actions.purchaseGoalWithCash(goal.id, actualAmountMinor, actualPaymentDopMinor, date, expense.id);
    } catch (reason) {
      await expensesState.deleteExpense(expense.id);
      throw reason;
    }
  };

  const combinedPendingCount = financial.pendingCount + expensesState.pendingCount;
  const combinedState: SyncState = financial.syncState === "error" || expensesState.syncState === "error"
    ? "error"
    : financial.syncState === "offline" || expensesState.syncState === "offline"
      ? "offline"
      : financial.syncState === "saving" || expensesState.syncState === "saving"
        ? "saving"
        : financial.syncState === "connecting" || expensesState.syncState === "connecting"
          ? "connecting"
          : "synced";
  const syncMessages = [
    financial.pendingCount > 0 || financial.syncState === "error" || financial.syncState === "offline"
      ? `Presupuesto: ${financial.syncMessage}`
      : null,
    expensesState.pendingCount > 0 || expensesState.syncState === "error" || expensesState.syncState === "offline"
      ? `Gastos: ${expensesState.syncMessage}`
      : null,
  ].filter((message): message is string => Boolean(message));
  const combinedMessage = syncMessages.length
    ? syncMessages.join(" · ")
    : combinedState === "synced"
      ? "Todos los datos están sincronizados."
      : combinedState === "saving"
        ? "Sincronizando cambios con Firebase…"
        : "Conectando con Firebase…";
  const retryCombinedSync = useCallback(async () => {
    appendSyncLog("Sistema", "info", `Reintento manual iniciado con ${combinedPendingCount} cambio${combinedPendingCount === 1 ? "" : "s"} pendiente${combinedPendingCount === 1 ? "" : "s"}.`);
    await Promise.all([financial.retrySync(), expensesState.retrySync()]);
  }, [combinedPendingCount, expensesState.retrySync, financial.retrySync]);

  const renderView = () => {
    switch (view) {
      case "capture": return <CaptureView activeCardName={activeCard?.name} onCreate={handleCreateExpense} onSaved={() => showNotice("Gasto registrado en el sistema")} />;
      case "review": return <ReviewView expenses={expensesState.expenses} activeCardName={activeCard?.name} onEdit={handleEditExpense} onDelete={handleDeleteExpense} onRestore={handleRestoreExpense} onNotice={showNotice} />;
      case "dashboard": return <DashboardView data={financial.data} expenses={expensesState.expenses} onPay={(value) => actions.payObligation(value)} onSaveCardPaymentPlan={actions.saveCardPaymentPlan} onNavigate={setView} />;
      case "budget": return <BudgetView data={financial.data} onSaveTemplate={actions.saveMonthlyTemplate} onArchiveTemplate={actions.archiveMonthlyTemplate} onCreateOneTime={actions.createOneTimeMonthly} onPay={(value) => actions.payObligation(value)} onReopen={(id) => actions.reopenObligation("monthly", id)} onCancel={actions.cancelMonthlyOccurrence} />;
      case "income": return <IncomeView data={financial.data} onSaveTemplate={actions.saveIncomeTemplate} onCreateOneTime={actions.createOneTimeIncome} onReceive={actions.receiveIncome} onReopen={actions.reopenIncome} />;
      case "future": return <FutureExpensesView data={financial.data} onSave={actions.saveNonMonthly} onPay={(value) => actions.payObligation(value)} onReopen={(id) => actions.reopenObligation("nonMonthly", id)} onAllocate={actions.allocateSavings} />;
      case "goals": return <PurchaseGoalsView data={financial.data} onSave={actions.savePurchaseGoal} onAllocate={actions.allocatePurchaseGoalSavings} onSchedule={actions.schedulePurchaseGoal} onPurchaseCash={handlePurchaseGoalCash} onPurchaseCard={actions.purchaseGoalWithCard} onDiscard={actions.discardPurchaseGoal} onRelease={actions.releaseAllocation} />;
      case "savings": return <SavingsView data={financial.data} onSave={actions.saveSavingsFund} onAddTransaction={actions.addSavingsTransaction} onTransfer={actions.transferSavings} onRelease={actions.releaseAllocation} />;
      case "cards": return <CreditCardsView data={financial.data} onSaveCard={actions.saveCreditCard} onSaveMinimum={actions.saveCardStatementMinimum} onAddTransaction={actions.addCardTransaction} onReverseTransaction={actions.reverseCardTransaction} />;
      case "reports": return <FinanceReportView data={financial.data} expenses={expensesState.expenses} />;
      case "settings": return <SettingsView data={financial.data} expenses={expensesState.expenses} syncPendingCount={combinedPendingCount} syncDiagnostics={{ expenses: { state: expensesState.syncState, message: expensesState.syncMessage, pendingCount: expensesState.pendingCount }, financial: { state: financial.syncState, message: financial.syncMessage, pendingCount: financial.pendingCount } }} onRetrySync={retryCombinedSync} onUpdateSettings={actions.updateSettings} onRecordBackup={(timestamp) => financial.commitUpdates({ lastBackupAt: timestamp })} canInstall={canInstall} onInstall={handleInstall} onLogout={onLogout} />;
      default: return <MoreView onNavigate={setView} />;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="compact-brand" type="button" onClick={() => setView("capture")} aria-label="Ir a registrar gasto"><span className="compact-brand-mark" aria-hidden="true">$</span><span>Gastos & Presupuesto</span></button>
        <SyncStatus state={combinedState} message={combinedMessage} pendingCount={combinedPendingCount} onRetry={retryCombinedSync} />
      </header>
      <main className="app-content">{renderView()}</main>
      <nav className="bottom-nav expanded-nav" aria-label="Navegación principal">
        <button type="button" className={view === "capture" ? "active" : ""} onClick={() => setView("capture")}><span className="nav-icon" aria-hidden="true">＋</span><span>Registrar</span></button>
        <button type="button" className={view === "review" ? "active" : ""} onClick={() => setView("review")}><span className="nav-icon" aria-hidden="true">≡</span><span>Historial</span></button>
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
