import { useMemo, useState } from "react";
import type { Expense } from "../../models/expense";
import type { CreditCard, FinancialData, MonthlyExpenseOccurrence, NonMonthlyOccurrence } from "../../models/finance";
import { formatBudgetCycleRange, formatShortDate } from "../../lib/date";
import { getCurrentFinancialPeriod } from "../../lib/financeDates";
import {
  calculateReportTotals,
  deriveDatedStatus,
  getFutureOccurrenceFunding,
  getStatementRemaining,
  isNonMonthlyWarningActive,
  isInSelectedPeriod,
  latestStatements,
  statusLabel,
} from "../../lib/financialCalculations";
import { formatCurrency } from "../../lib/money";
import { PageHeading, PayModal, PeriodSelector, StatusChip, type PayModalValue } from "./Shared";

type Payable = { type: "monthly"; item: MonthlyExpenseOccurrence } | { type: "nonMonthly"; item: NonMonthlyOccurrence };

interface DashboardViewProps {
  data: FinancialData;
  expenses: Expense[];
  onPay: (value: PayModalValue & { sourceType: "monthly" | "nonMonthly"; sourceId: string; currency: "DOP" | "USD" }) => Promise<void>;
  onNavigate: (view: "budget" | "future" | "income" | "cards") => void;
}

export function DashboardView({ data, expenses, onPay, onNavigate }: DashboardViewProps) {
  const current = getCurrentFinancialPeriod();
  const [monthKey, setMonthKey] = useState(current.financialMonth);
  const [quincena, setQuincena] = useState<"all" | 1 | 2>(current.quincena);
  const [payable, setPayable] = useState<Payable | null>(null);
  const [initialPayMethod, setInitialPayMethod] = useState<"cash" | "creditCard">("cash");
  const monthSet = useMemo(() => new Set([monthKey]), [monthKey]);
  const activeCards = useMemo(() => Object.values(data.creditCards).filter((card) => card.active && !card.archivedAt), [data.creditCards]);

  const obligations = useMemo(() => {
    const monthly: Payable[] = Object.values(data.monthlyOccurrences)
      .filter((item) => item.status === "upcoming" && isInSelectedPeriod(item.dueDate, monthSet, quincena))
      .map((item) => ({ type: "monthly", item }));
    const irregular: Payable[] = Object.values(data.nonMonthlyOccurrences)
      .filter((item) => {
        if (item.status !== "upcoming") return false;
        if (isInSelectedPeriod(item.dueDate, monthSet, quincena)) return true;
        const plan = data.nonMonthlyExpenses[item.planId];
        const warningMonths = plan?.warningMonths ?? data.settings.nonMonthlyWarningMonths;
        return monthKey === current.financialMonth && isNonMonthlyWarningActive(item, current.dateKey, warningMonths);
      })
      .map((item) => ({ type: "nonMonthly", item }));
    return [...monthly, ...irregular].sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate));
  }, [current.dateKey, current.financialMonth, data.monthlyOccurrences, data.nonMonthlyExpenses, data.nonMonthlyOccurrences, data.settings.nonMonthlyWarningMonths, monthKey, monthSet, quincena]);

  const income = useMemo(() => Object.values(data.incomeOccurrences)
    .filter((item) => item.status !== "cancelled" && isInSelectedPeriod(item.expectedDate, monthSet, quincena))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)), [data.incomeOccurrences, monthSet, quincena]);

  const statements = useMemo(() => latestStatements(data)
    .map((statement) => ({ statement, remaining: getStatementRemaining(data, statement), card: data.creditCards[statement.cardId] }))
    .filter((item) => item.remaining > 0)
    .sort((a, b) => a.statement.dueDate.localeCompare(b.statement.dueDate)), [data]);

  const dop = calculateReportTotals(data, expenses, [monthKey], quincena, "DOP");
  const usd = calculateReportTotals(data, expenses, [monthKey], quincena, "USD");

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Visión general" title="Dashboard" />
      <PeriodSelector monthKey={monthKey} onMonthChange={setMonthKey} quincena={quincena} onQuincenaChange={setQuincena} />
      <p className="period-caption">{formatBudgetCycleRange(monthKey)} · Los valores son una proyección, no un balance bancario.</p>

      <div className="projection-grid">
        <article className={`projection-card ${dop.planning < 0 ? "negative" : "positive"}`}>
          <span>Proyección DOP</span><strong>{formatCurrency(dop.planning, "DOP")}</strong>
          <small>{dop.planning < 0 ? "Faltante previsto" : "Disponible previsto"}</small>
        </article>
        <article className={`projection-card ${usd.planning < 0 ? "negative" : "positive"}`}>
          <span>Proyección USD</span><strong>{formatCurrency(usd.planning, "USD")}</strong>
          <small>{usd.planning < 0 ? "Faltante previsto" : "Disponible previsto"}</small>
        </article>
      </div>

      <div className="summary-strip">
        <button type="button" onClick={() => onNavigate("income")}><span>Ingresos recibidos</span><strong>{formatCurrency(dop.receivedIncome, "DOP")}</strong><small>Esperados: {formatCurrency(dop.expectedIncome, "DOP")}</small></button>
        <button type="button" onClick={() => onNavigate("budget")}><span>Mensuales pendientes</span><strong>{formatCurrency(dop.monthlyPending, "DOP")}</strong><small>Pagados: {formatCurrency(dop.monthlyPaid, "DOP")}</small></button>
        <button type="button" onClick={() => onNavigate("future")}><span>No mensuales pendientes</span><strong>{formatCurrency(dop.nonMonthlyPending, "DOP")}</strong><small>USD: {formatCurrency(usd.nonMonthlyPending, "USD")}</small></button>
      </div>

      <section className="dashboard-section">
        <div className="section-title-row"><div><span className="eyebrow">Prioridad</span><h2>Pagos próximos</h2></div><button className="text-button" type="button" onClick={() => onNavigate("budget")}>Ver presupuesto</button></div>
        {!obligations.length ? <div className="success-panel">No hay obligaciones pendientes en este período.</div> : (
          <div className="finance-list">
            {obligations.map((payableItem) => {
              const item = payableItem.item;
              const immediateStatus = deriveDatedStatus(item, current.dateKey, payableItem.type === "monthly" ? data.settings.dueSoonDaysMonthly : 0);
              const plan = payableItem.type === "nonMonthly" ? data.nonMonthlyExpenses[(item as NonMonthlyOccurrence).planId] : undefined;
              const status = payableItem.type === "nonMonthly" && immediateStatus === "upcoming"
                && isNonMonthlyWarningActive(item as NonMonthlyOccurrence, current.dateKey, plan?.warningMonths ?? data.settings.nonMonthlyWarningMonths)
                ? "dueSoon"
                : immediateStatus;
              const funding = payableItem.type === "nonMonthly" ? getFutureOccurrenceFunding(data, item as NonMonthlyOccurrence) : null;
              return (
                <article className="finance-row-card" key={item.id}>
                  <div className="finance-row-main">
                    <div><div className="row-title-line"><h3>{item.name}</h3><StatusChip status={status} label={payableItem.type === "nonMonthly" && status === "dueSoon" ? "Planificar" : statusLabel(status)} /></div><p>Vence {formatShortDate(item.dueDate)}{funding ? ` · Reservado ${formatCurrency(funding.reservedMinor, item.currency)} · Falta ${formatCurrency(funding.missingMinor, item.currency)}` : ""}</p></div>
                    <strong>{formatCurrency(item.expectedAmountMinor, item.currency)}</strong>
                  </div>
                  <div className="row-actions"><button type="button" className="button button-primary" onClick={() => { setInitialPayMethod("cash"); setPayable(payableItem); }}>Pagar</button>{item.canPayWithCard && <button type="button" className="button button-secondary" onClick={() => { setInitialPayMethod("creditCard"); setPayable(payableItem); }}>Pagar con tarjeta</button>}<button type="button" className="button button-quiet" onClick={() => onNavigate(payableItem.type === "monthly" ? "budget" : "future")}>Detalles</button></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-title-row"><div><span className="eyebrow">Entrada</span><h2>Ingresos del período</h2></div><button className="text-button" type="button" onClick={() => onNavigate("income")}>Gestionar</button></div>
        {!income.length ? <p className="muted-panel">No hay ingresos esperados en este período.</p> : <div className="compact-ledger">{income.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{formatShortDate(item.expectedDate)}</small></span><span><StatusChip status={item.status} label={item.status === "received" ? "Recibido" : "Esperado"} /><strong>{formatCurrency(item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.expectedAmountMinor, item.currency)}</strong></span></div>)}</div>}
      </section>

      <section className="dashboard-section">
        <div className="section-title-row"><div><span className="eyebrow">Deuda</span><h2>Estados de tarjeta</h2></div><button className="text-button" type="button" onClick={() => onNavigate("cards")}>Ver tarjetas</button></div>
        {!statements.length ? <p className="muted-panel">No hay estados pendientes.</p> : <div className="compact-ledger">{statements.map(({ statement, remaining, card }) => {
          const status = deriveDatedStatus({ status: remaining <= 0 ? "paid" : "upcoming", dueDate: statement.dueDate }, current.dateKey, data.settings.dueSoonDaysCards);
          return <button type="button" onClick={() => onNavigate("cards")} key={statement.id}><span><strong>{card?.name || "Tarjeta"}</strong><small>Corte {formatShortDate(statement.cutDate)} · Vence {formatShortDate(statement.dueDate)}</small></span><span><StatusChip status={status} label={statusLabel(status)} /><strong>{formatCurrency(remaining, statement.currency)}</strong></span></button>;
        })}</div>}
      </section>

      {payable && <PayModal title={payable.item.name} expectedMinor={payable.item.expectedAmountMinor} currency={payable.item.currency} canPayWithCard={payable.item.canPayWithCard} cards={activeCards as CreditCard[]} allowSavings={payable.type === "nonMonthly"} initialMethod={initialPayMethod} onClose={() => setPayable(null)} onConfirm={(value) => onPay({ ...value, sourceType: payable.type, sourceId: payable.item.id, currency: payable.item.currency })} />}
    </section>
  );
}
