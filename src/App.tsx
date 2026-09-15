import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { LoginScreen } from "./components/LoginScreen";
import { CaptureView } from "./components/CaptureView";
import { ReviewView } from "./components/ReviewView";
import { SyncStatus } from "./components/SyncStatus";
import { BudgetView } from "./components/finance/BudgetView";
import { DashboardView } from "./components/finance/DashboardView";
import { FinancialHubView, type FinancialHubSection } from "./components/finance/FinancialHubView";
import { FinanceReportView } from "./components/finance/FinanceReportView";
import { FutureExpensesView } from "./components/finance/FutureExpensesView";
import { IncomeView } from "./components/finance/IncomeView";
import { PurchaseGoalsView } from "./components/finance/PurchaseGoalsView";
import { SettingsView } from "./components/finance/SettingsView";
import { useAuth } from "./hooks/useAuth";
import { useExpenses } from "./hooks/useExpenses";
import { useFinancialData } from "./hooks/useFinancialData";
import { useFinanceActions, createFinanceActions } from "./hooks/useFinanceActions";
import { buildExpenseUpdates, collapsePatchVersions, mergedExpenses, newExpense } from "./lib/movementEditing";
import { applyFinancialUpdates } from "./lib/financialState";
import { toLocalDateKey } from "./lib/date";
import type { MovementTarget } from "./lib/movementEditing";
import { MovementEditor } from "./components/MovementEditor";
import { CycleReviewView, BalanceIssuePanel } from "./components/CycleReviewView";
import { SourceMovementLinks } from "./components/SourceMovementLinks";
import { EditExpenseModal } from "./components/EditExpenseModal";
import { usePwaInstall } from "./hooks/usePwaInstall";
import type { AppUserDefinition } from "./config/appUsers";
import type { MoneyAccountId, PaymentMethod, PurchaseGoal } from "./models/finance";
import type { Expense, ExpenseEditableFields, SyncState } from "./models/expense";
import type { NewExpenseInput } from "./hooks/useExpenses";
import { appendSyncLog } from "./lib/syncLog";

type View = "capture" | "review" | "dashboard" | "budget" | "future" | "goals" | "savings" | "income" | "cards" | "money" | "loans" | "reports" | "settings" | "more" | "closings";

interface NoticeState {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

const overflowViews: View[] = ["future", "goals", "savings", "income", "cards", "money", "loans", "reports", "settings", "more"];

function MoreView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const items: Array<{ view: View; icon: string; title: string; text: string }> = [
    { view: "future", icon: "◷", title: "Gastos no mensuales", text: "Seguros, renovaciones y próximos 12 meses" },
    { view: "goals", icon: "☆", title: "Metas de compra", text: "Compras deseadas sin fecha ni impacto en proyecciones" },
    { view: "income", icon: "↓", title: "Ingresos", text: "Salarios, otros ingresos y valores recibidos" },
    { view: "money", icon: "$", title: "Cuentas y productos", text: "Bancos, efectivo, ahorros, tarjeta y préstamos" },
    { view: "reports", icon: "▥", title: "Reportes", text: "Gastos, flujo de caja y planificación" },
    { view: "closings", icon: "✓", title: "Cierres quincenales", text: "Comparar saldos reales, revisar diferencias y confirmar" },
    { view: "settings", icon: "⚙", title: "Configuración", text: "Avisos, respaldo, restauración y app" },
  ];
  return <section className="finance-page"><div className="finance-heading"><div><span className="eyebrow">Todas las áreas</span><h1>Más</h1></div></div><div className="more-grid">{items.map((item) => <button key={item.view} type="button" onClick={() => onNavigate(item.view)}><span className="more-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.text}</small></span><b aria-hidden="true">›</b></button>)}</div></section>;
}

function AuthenticatedApp({ user, onLogout }: { user: AppUserDefinition; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<View>("capture");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [movementTarget,setMovementTarget] = useState<MovementTarget|null>(null);
  const [linkedExpense,setLinkedExpense] = useState<Expense|null>(null);
  const reviewScroll = useRef(0);
  const returnToReview = useRef(false);
  const legacyExpensesState = useExpenses();
  const financial = useFinancialData(user);
  const allExpenses = useMemo(() => mergedExpenses(financial.data, legacyExpensesState.expenses), [financial.data, legacyExpensesState.expenses]);
  const expensesState = { ...legacyExpensesState, expenses: allExpenses };
  const openMovement = (requested:MovementTarget, fromReview=false) => {
    if(fromReview) reviewScroll.current=window.scrollY;
    returnToReview.current=fromReview;
    let target=requested;
    const money=target.source==="moneyTransaction"?financial.data.moneyTransactions[target.sourceId]:undefined;
    const savings=target.source==="savingsTransaction"?financial.data.savingsTransactions[target.sourceId]:undefined;
    const card=target.source==="cardTransaction"?financial.data.cardTransactions[target.sourceId]:undefined;
    const extraId=money?.linkedDailyExpenseId||card?.linkedDailyExpenseId;
    if(extraId){const expense=allExpenses.find(e=>e.id===extraId);if(expense){setLinkedExpense(expense);return;}}
    const paymentId=money?.linkedPaymentId||savings?.linkedPaymentId||card?.linkedPaymentId;
    if(paymentId) target={source:"payment",sourceId:paymentId};
    else if(money?.linkedCardTransactionId||savings?.linkedCardTransactionId) target={source:"cardTransaction",sourceId:(money?.linkedCardTransactionId||savings?.linkedCardTransactionId)!};
    const p=target.source==="payment"?financial.data.payments[target.sourceId]:undefined;
    const o=p?(p.sourceType==="monthly"?financial.data.monthlyOccurrences:financial.data.nonMonthlyOccurrences)[p.sourceId]:undefined;
    if(fromReview) setView(p ? (p.loanId||o?.loanId?"loans":o?.category==="Ahorros"?"savings":o&&"sourcePurchaseGoalId" in o&&o.sourcePurchaseGoalId?"goals":p.sourceType==="monthly"?"budget":"future") : target.source==="savingsTransaction"?"savings":target.source==="cardTransaction"?"cards":"money");
    if (fromReview && target.source === "cardTransaction" && financial.data.cardTransactions[target.sourceId]?.linkedPurchaseGoalId) setView("goals");
    setMovementTarget(target);
  };
  const actions = useFinanceActions({ data: financial.data, user, commitUpdates: financial.commitUpdates });
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
    const expense = newExpense({ ...input, occurredDate: input.occurredDate || toLocalDateKey() });
    await financial.commitUpdates(await buildExpenseUpdates(financial.data, user, expense));
    return expense;
  };

  const handleEditExpense = async (expenseId: string, changes: ExpenseEditableFields) => {
    const existing = expensesState.expenses.find((expense) => expense.id === expenseId);
    if (!existing) throw new Error("El gasto ya no está disponible.");
    const updated: Expense = { ...existing, ...changes };
    await financial.commitUpdates(await buildExpenseUpdates(financial.data, user, updated));
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const expense = allExpenses.find(e => e.id === expenseId);
    if (expense) await financial.commitUpdates(await buildExpenseUpdates(financial.data, user, expense, true));
  };

  const handleRestoreExpense = useCallback(async (expense: Expense) => {
    await financial.commitUpdates(await buildExpenseUpdates(financial.data, user, expense));
  }, [financial.data, financial.commitUpdates, user]);

  const handlePurchaseGoalDirect = async (
    goal: PurchaseGoal,
    actualAmountMinor: number,
    actualPaymentDopMinor: number,
    date: string,
    method: Exclude<PaymentMethod, "creditCard">,
    moneyAccountId: MoneyAccountId,
    transferFeeMinor: number,
  ) => {
    if (!goal.category) throw new Error("Selecciona una categoría para la meta antes de comprarla.");
    const expense = newExpense({
      name: goal.name,
      unitPriceCents: actualPaymentDopMinor,
      quantity: 1,
      occurredDate: date,
      category: goal.category,
      currency: "DOP",
      paymentMethod: method === "bankTransfer" ? "transfer" : method === "debitCard" ? "debit" : "cash",
      moneyAccountId,
      transferFeeCents: method === "bankTransfer" ? transferFeeMinor : undefined,
    });
    const patch = await buildExpenseUpdates(financial.data, user, expense);
    const draft = applyFinancialUpdates(financial.data, patch);
    await createFinanceActions({ data: draft, user, commitUpdates: async p => { Object.assign(patch, p); } })
      .purchaseGoalWithCash(goal.id, actualAmountMinor, actualPaymentDopMinor, date, expense.id, method);
    await financial.commitUpdates(collapsePatchVersions(financial.data,patch));
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

  const renderFinancialHub = (initialSection: FinancialHubSection) => <FinancialHubView
    onOpenMovement={target=>openMovement(target)}
    data={financial.data}
    canReconcileSavingsAccounts={financial.syncState === "synced" && financial.pendingCount === 0}
    initialSection={initialSection}
    onSaveBank={actions.saveBank}
    onDeleteBank={actions.deleteEmptyBank}
    onSaveAccount={actions.saveMoneyAccount}
    onInitializeCash={actions.initializeCashAccount}
    onAdjustAccount={actions.adjustMoneyAccountBalance}
    onTransferMoney={actions.transferMoney}
    onReconcileSavingsAccounts={actions.reconcileSavingsAccounts}
    onSaveSavingsFund={actions.saveSavingsFund}
    onAddSavingsTransaction={actions.addSavingsTransaction}
    onTransferSavings={actions.transferSavings}
    onReleaseSavings={actions.releaseAllocation}
    onSaveCard={actions.saveCreditCard}
    onSaveCardMinimum={actions.saveCardStatementMinimum}
    onAddCardTransaction={actions.addCardTransaction}
    onReverseCardTransaction={actions.reverseCardTransaction}
    onSaveLoan={actions.saveLoan}
    onAdjustLoan={actions.adjustLoanBalance}
    onReverseLoanAdjustment={actions.reverseLoanAdjustment}
  />;

  const renderView = () => {
    switch (view) {
      case "capture": return <CaptureView data={financial.data} activeCardName={activeCard?.name} transferFeeRatePercent={financial.data.settings.transferFeeRatePercent} onCreate={handleCreateExpense} onSaved={() => showNotice("Gasto registrado en el sistema")} />;
      case "review": return null;
      case "closings": return <CycleReviewView data={financial.data} actor={user.uid} synced={combinedState === "synced" && combinedPendingCount===0} onCommit={financial.commitUpdates} />;
      case "dashboard": return <DashboardView data={financial.data} expenses={expensesState.expenses} onPay={(value) => actions.payObligation(value)} onPostpone={actions.postponeObligation} onSaveCardPaymentPlan={actions.saveCardPaymentPlan} onUpdateDashboardAccounts={(accountIds) => actions.updateSettings({ ...financial.data.settings, dashboardMoneyAccountIds: accountIds })} onNavigate={setView} />;
      case "budget": return <BudgetView data={financial.data} onSaveTemplate={actions.saveMonthlyTemplate} onArchiveTemplate={actions.archiveMonthlyTemplate} onCreateOneTime={actions.createOneTimeMonthly} onUpdateOneTime={actions.updateOneTimeMonthly} onReconcileStartingPoint={actions.reconcileStartingPoint} onPay={(value) => actions.payObligation(value)} onPostpone={(sourceType, sourceId, newDueDate) => actions.postponeObligation(sourceType, sourceId, newDueDate)} onReopen={(id) => actions.reopenObligation("monthly", id)} onCancel={actions.cancelMonthlyOccurrence} />;
      case "income": return <IncomeView data={financial.data} onSaveTemplate={actions.saveIncomeTemplate} onCreateOneTime={actions.createOneTimeIncome} onReceive={actions.receiveIncome} onReopen={actions.reopenIncome} />;
      case "future": return <FutureExpensesView data={financial.data} onSave={actions.saveNonMonthly} onPay={(value) => actions.payObligation(value)} onPostpone={(sourceType, sourceId, newDueDate) => actions.postponeObligation(sourceType, sourceId, newDueDate)} onReopen={(id) => actions.reopenObligation("nonMonthly", id)} onAllocate={actions.allocateSavings} />;
      case "goals": return <PurchaseGoalsView data={financial.data} onSave={actions.savePurchaseGoal} onAllocate={actions.allocatePurchaseGoalSavings} onSchedule={actions.schedulePurchaseGoal} onPurchaseDirect={handlePurchaseGoalDirect} onPurchaseCard={actions.purchaseGoalWithCard} onDiscard={actions.discardPurchaseGoal} onRelease={actions.releaseAllocation} />;
      case "savings": return renderFinancialHub("savings");
      case "cards": return renderFinancialHub("cards");
      case "money": return renderFinancialHub("overview");
      case "loans": return renderFinancialHub("loans");
      case "reports": return <FinanceReportView data={financial.data} expenses={expensesState.expenses} />;
      case "settings": return <SettingsView data={financial.data} expenses={expensesState.expenses} syncPendingCount={combinedPendingCount} syncDiagnostics={{ expenses: { state: expensesState.syncState, message: expensesState.syncMessage, pendingCount: expensesState.pendingCount }, financial: { state: financial.syncState, message: financial.syncMessage, pendingCount: financial.pendingCount } }} onRetrySync={retryCombinedSync} onDiscardExpenseChanges={expensesState.discardPendingChanges} onUpdateSettings={actions.updateSettings} onRecordBackup={(timestamp) => financial.commitUpdates({ lastBackupAt: timestamp })} canInstall={canInstall} onInstall={handleInstall} onLogout={onLogout} />;
      default: return <MoreView onNavigate={setView} />;
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="compact-brand" type="button" onClick={() => setView("capture")} aria-label="Ir a registrar gasto"><span className="compact-brand-mark" aria-hidden="true">$</span><span>Gastos & Presupuesto</span></button>
        <SyncStatus state={combinedState} message={combinedMessage} pendingCount={combinedPendingCount} onRetry={retryCombinedSync} />
      </header>
      <main className="app-content">
        {["dashboard","money","loans","cards","savings","closings"].includes(view) && <BalanceIssuePanel data={financial.data} actor={user.uid} onCommit={financial.commitUpdates} />}
        {view === "dashboard" && <button className="button button-secondary" onClick={()=>setView("closings")}>Revisar y cerrar quincena</button>}
        <div hidden={view !== "review"}><ReviewView data={financial.data} expenses={expensesState.expenses} activeCardName={activeCard?.name} transferFeeRatePercent={financial.data.settings.transferFeeRatePercent} onEdit={handleEditExpense} onDelete={handleDeleteExpense} onRestore={handleRestoreExpense} onClassifyHistorical={actions.classifyHistoricalPayment} onNotice={showNotice} onOpenMovement={target=>{
          openMovement(target,true);
        }} /></div>
        {renderView()}
        {["budget","future","goals"].includes(view) && <SourceMovementLinks data={financial.data} section={view} onOpen={target=>openMovement(target)} />}
        {linkedExpense && <EditExpenseModal expense={linkedExpense} data={financial.data} activeCardName={activeCard?.name} transferFeeRatePercent={financial.data.settings.transferFeeRatePercent} onSave={handleEditExpense} onClose={()=>setLinkedExpense(null)} />}
        {movementTarget && <MovementEditor key={`${movementTarget.source}:${movementTarget.sourceId}`} data={financial.data} user={user} target={movementTarget} onCommit={financial.commitUpdates} onClose={()=>{
          setMovementTarget(null);if(returnToReview.current){setView("review");returnToReview.current=false;requestAnimationFrame(()=>window.scrollTo(0,reviewScroll.current));}
        }} />}
      </main>
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
