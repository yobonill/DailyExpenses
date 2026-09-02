import { useMemo, useState, type FormEvent } from "react";
import type { Expense } from "../../models/expense";
import type { CreditCard, FinancialData, MonthlyExpenseOccurrence, NonMonthlyOccurrence } from "../../models/finance";
import { formatBudgetCycleRange, formatMonthTitle, formatShortDate } from "../../lib/date";
import { getCurrentFinancialPeriod } from "../../lib/financeDates";
import {
  calculateReportTotals,
  calculateCardPaymentProjection,
  deriveDatedStatus,
  getCardMinimumPaymentProgress,
  getCardCurrentDebt,
  getCardPaymentPlanId,
  getFutureOccurrenceFunding,
  getStatementRemaining,
  isNonMonthlyWarningActive,
  isInSelectedPeriod,
  isPlannedOccurrenceInSelectedPeriod,
  latestStatements,
  minimumPaymentStatusLabel,
  statusLabel,
} from "../../lib/financialCalculations";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import { Modal, MoneyField, PageHeading, PayModal, PeriodSelector, StatusChip, type PayModalValue } from "./Shared";

type Payable = { type: "monthly"; item: MonthlyExpenseOccurrence } | { type: "nonMonthly"; item: NonMonthlyOccurrence };

interface DashboardViewProps {
  data: FinancialData;
  expenses: Expense[];
  onPay: (value: PayModalValue & { sourceType: "monthly" | "nonMonthly"; sourceId: string; currency: "DOP" | "USD" }) => Promise<void>;
  onSaveCardPaymentPlan: (financialMonth: string, quincena: 1 | 2, plannedDopMinor: number, plannedUsdMinor: number) => Promise<void>;
  onNavigate: (view: "budget" | "future" | "income" | "cards") => void;
}

type CardPlanDraft = Record<1 | 2, { dop: string; usd: string }>;
const isZeroMoneyInput = (value: string): boolean => /^0+(?:[.,]0+)?$/.test(value.trim());
const minimumChipStatus = (status: ReturnType<typeof getCardMinimumPaymentProgress>["status"]): string => {
  if (status === "paidOnTime") return "paid";
  if (status === "paidLate" || status === "overdue") return "overdue";
  if (status === "dueSoon" || status === "dueToday") return status;
  if (status === "notConfigured") return "partial";
  return "upcoming";
};

function CardPaymentPlanModal({ data, monthKey, quincena, onSave, onClose }: {
  data: FinancialData;
  monthKey: string;
  quincena: 1 | 2 | "all";
  onSave: DashboardViewProps["onSaveCardPaymentPlan"];
  onClose: () => void;
}) {
  const readPlan = (item: 1 | 2) => data.cardPaymentPlans[getCardPaymentPlanId(monthKey, item)];
  const [draft, setDraft] = useState<CardPlanDraft>({
    1: { dop: minorToInput(readPlan(1)?.plannedDopMinor), usd: minorToInput(readPlan(1)?.plannedUsdMinor) },
    2: { dop: minorToInput(readPlan(2)?.plannedDopMinor), usd: minorToInput(readPlan(2)?.plannedUsdMinor) },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visibleQuincenas: Array<1 | 2> = quincena === "all" ? [1, 2] : [quincena];
  const updateDraft = (item: 1 | 2, field: "dop" | "usd", value: string) => {
    setDraft((current) => ({ ...current, [item]: { ...current[item], [field]: value } }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = visibleQuincenas.some((item) =>
      (draft[item].dop.trim() && !isZeroMoneyInput(draft[item].dop) && !parseMoneyToCents(draft[item].dop))
        || (draft[item].usd.trim() && !isZeroMoneyInput(draft[item].usd) && !parseMoneyToCents(draft[item].usd)),
    );
    if (invalid) {
      setError("Revisa los montos del pago previsto.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      for (const item of visibleQuincenas) {
        await onSave(
          monthKey,
          item,
          parseMoneyToCents(draft[item].dop) || 0,
          parseMoneyToCents(draft[item].usd) || 0,
        );
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el pago previsto.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Pago previsto de tarjeta" onClose={onClose}><form className="form-grid" onSubmit={submit}><p className="privacy-note">Indica el total que planeas pagar en cada quincena. Si ya registraste parte del pago, el Dashboard descontará solamente lo que todavía falta.</p>{visibleQuincenas.map((item) => <fieldset className="card-plan-fieldset" key={item}><legend>Quincena {item} · {formatMonthTitle(monthKey)}</legend><MoneyField label="Pago previsto de deuda DOP" value={draft[item].dop} onChange={(value) => updateDraft(item, "dop", value)} currency="DOP" required={false} /><MoneyField label="Deuda USD que planeas cancelar" value={draft[item].usd} onChange={(value) => updateDraft(item, "usd", value)} currency="USD" required={false} /></fieldset>)}{data.settings.estimatedUsdToDopRate <= 0 && visibleQuincenas.some((item) => Boolean(parseMoneyToCents(draft[item].usd))) && <p className="validation-warning">El pago USD se guardará, pero no podrá calcularse su equivalente en pesos hasta configurar la tasa estimada.</p>}{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar pago previsto"}</button></div></form></Modal>;
}

export function DashboardView({ data, expenses, onPay, onSaveCardPaymentPlan, onNavigate }: DashboardViewProps) {
  const current = getCurrentFinancialPeriod();
  const [monthKey, setMonthKey] = useState(current.financialMonth);
  const [quincena, setQuincena] = useState<"all" | 1 | 2>(current.quincena);
  const [payable, setPayable] = useState<Payable | null>(null);
  const [planningCardPayment, setPlanningCardPayment] = useState(false);
  const [initialPayMethod, setInitialPayMethod] = useState<"cash" | "creditCard">("cash");
  const monthSet = useMemo(() => new Set([monthKey]), [monthKey]);
  const activeCards = useMemo(() => Object.values(data.creditCards).filter((card) => card.active && !card.archivedAt), [data.creditCards]);

  const obligations = useMemo(() => {
    const monthly: Payable[] = Object.values(data.monthlyOccurrences)
      .filter((item) => item.status === "upcoming" && isPlannedOccurrenceInSelectedPeriod(item, monthSet, quincena))
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
  const estimatedUsdRate = data.settings.estimatedUsdToDopRate;
  const card = activeCards[0];
  const cardProjection = calculateCardPaymentProjection(data, [monthKey], quincena, estimatedUsdRate);
  const netAvailableDop = dop.planning - cardProjection.totalCashCommitmentDopMinor;
  const availableForDailySpendingDop = Math.max(0, netAvailableDop);
  const projectedShortfallDop = Math.max(0, -netAvailableDop);
  const hasPlannedCardPayment = cardProjection.plannedDopMinor > 0 || cardProjection.plannedUsdMinor > 0;
  const hasMinimumDue = cardProjection.minimumDueDopMinor > 0 || cardProjection.minimumDueUsdMinor > 0;
  const hasMinimumGap = cardProjection.minimumTopUpDopMinor > 0 || cardProjection.minimumTopUpUsdMinor > 0;
  const hasUnconvertedUsdPayment = (cardProjection.remainingPlannedUsdMinor > 0 || cardProjection.minimumTopUpUsdMinor > 0) && estimatedUsdRate <= 0;

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Visión general" title="Dashboard" />
      <PeriodSelector monthKey={monthKey} onMonthChange={setMonthKey} quincena={quincena} onQuincenaChange={setQuincena} />
      <p className="period-caption">{formatBudgetCycleRange(monthKey)} · Los valores son una proyección, no un balance bancario.</p>

      <div className="projection-grid dashboard-projection-grid">
        <article className={`projection-card projection-card-featured ${projectedShortfallDop > 0 ? "negative" : "positive"}`}>
          <span>Disponible para gastos diarios</span><strong>{formatCurrency(availableForDailySpendingDop, "DOP")}</strong>
          <dl className="projection-breakdown">
            <div><dt>Ingresos proyectados</dt><dd>{formatCurrency(dop.planningIncome, "DOP")}</dd></div>
            <div><dt>Compromisos fijos (sin tarjeta)</dt><dd>− {formatCurrency(dop.planningCommitments, "DOP")}</dd></div>
            <div><dt>Gastos extras pagados sin crédito</dt><dd>− {formatCurrency(dop.dailyCashSpending, "DOP")}</dd></div>
            <div><dt>Compras extras con tarjeta (no descontadas aquí)</dt><dd>{formatCurrency(dop.dailyCardSpending, "DOP")}</dd></div>
            <div><dt>Pago de tarjeta registrado, previsto o mínimo</dt><dd>− {formatCurrency(cardProjection.totalCashCommitmentDopMinor, "DOP")}</dd></div>
            <div className="projection-shortfall"><dt>Faltante previsto</dt><dd>{formatCurrency(projectedShortfallDop, "DOP")}</dd></div>
          </dl>
          <small>Las compras con tarjeta aumentan su deuda. Se descuenta el pago registrado o previsto y, cuando corresponde, al menos el pago mínimo pendiente; nunca se asume el saldo completo.</small>
        </article>
        <article className="projection-card card-payment-projection">
          <span>Tarjeta de crédito</span><strong>{card?.name || "Sin tarjeta configurada"}</strong>
          {card ? <><dl className="projection-breakdown"><div><dt>Deuda registrada DOP</dt><dd>{formatCurrency(getCardCurrentDebt(data, card.id, "DOP"), "DOP")}</dd></div><div><dt>Deuda registrada USD</dt><dd>{formatCurrency(getCardCurrentDebt(data, card.id, "USD"), "USD")}</dd></div><div><dt>Pago previsto DOP</dt><dd>{formatCurrency(cardProjection.plannedDopMinor, "DOP")}</dd></div><div><dt>Deuda USD prevista para pagar</dt><dd>{formatCurrency(cardProjection.plannedUsdMinor, "USD")}</dd></div>{cardProjection.minimumDueDopMinor > 0 && <div><dt>Pago mínimo DOP del período</dt><dd>{formatCurrency(cardProjection.minimumDueDopMinor, "DOP")}</dd></div>}{cardProjection.minimumDueUsdMinor > 0 && <div><dt>Pago mínimo USD del período</dt><dd>{formatCurrency(cardProjection.minimumDueUsdMinor, "USD")}</dd></div>}{cardProjection.actualCashOutflowDopMinor > 0 && <div><dt>Ya pagado en el período</dt><dd>{formatCurrency(cardProjection.actualCashOutflowDopMinor, "DOP")}</dd></div>}{cardProjection.estimatedRemainingUsdDopMinor > 0 && <div><dt>Pago USD pendiente estimado</dt><dd>{formatCurrency(cardProjection.estimatedRemainingUsdDopMinor, "DOP")}</dd></div>}{hasMinimumGap && <div><dt>Adicional para cubrir el mínimo</dt><dd>{formatCurrency(cardProjection.minimumTopUpDopMinor + cardProjection.estimatedMinimumTopUpUsdDopMinor, "DOP")}</dd></div>}</dl>{!hasPlannedCardPayment && !hasMinimumDue && cardProjection.actualCashOutflowDopMinor <= 0 && <p className="card-plan-warning">La deuda de tarjeta no está incluida en la proyección porque no has definido un pago y todavía no hay un pago mínimo registrado para este período.</p>}{hasMinimumDue && <p className="minimum-payment-note">La proyección garantiza como piso el pago mínimo pendiente, pero no asume que pagarás el estado completo.</p>}{cardProjection.unconfiguredMinimumCount > 0 && <p className="card-plan-warning">Hay un estado de cuenta que vence en este período sin pago mínimo registrado.</p>}{hasUnconvertedUsdPayment && <p className="card-plan-warning">El pago USD pendiente todavía no está incluido en DOP porque falta configurar la tasa estimada.</p>}<div className="row-actions"><button className="button button-secondary" type="button" onClick={() => setPlanningCardPayment(true)}>{hasPlannedCardPayment ? "Editar pago previsto" : "Definir pago previsto"}</button><button className="button button-quiet" type="button" onClick={() => onNavigate("cards")}>Revisar pago mínimo</button></div></> : <><small>Configura tu tarjeta para registrar la deuda y planificar sus pagos.</small><button className="button button-secondary" type="button" onClick={() => onNavigate("cards")}>Configurar tarjeta</button></>}
        </article>
      </div>

      <div className="summary-strip">
        <button type="button" onClick={() => onNavigate("income")}><span>Ingresos proyectados</span><strong>{formatCurrency(dop.planningIncome, "DOP")}</strong><small>Recibidos: {formatCurrency(dop.receivedIncome, "DOP")}</small></button>
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
          const minimum = getCardMinimumPaymentProgress(data, statement, current.dateKey, data.settings.dueSoonDaysCards);
          return <button type="button" onClick={() => onNavigate("cards")} key={statement.id}><span><strong>{card?.name || "Tarjeta"} · {statement.currency}</strong><small>Corte {formatShortDate(statement.cutDate)} · Vence {formatShortDate(statement.dueDate)}</small><small>Saldo pendiente: {formatCurrency(remaining, statement.currency)}</small></span><span><StatusChip status={minimumChipStatus(minimum.status)} label={minimumPaymentStatusLabel(minimum.status)} /><strong>{minimum.configured ? `Falta ${formatCurrency(minimum.remainingMinor, statement.currency)}` : "Registrar mínimo"}</strong></span></button>;
        })}</div>}
      </section>

      {payable && <PayModal title={payable.item.name} expectedMinor={payable.item.expectedAmountMinor} currency={payable.item.currency} canPayWithCard={payable.item.canPayWithCard} cards={activeCards as CreditCard[]} allowSavings={payable.type === "nonMonthly"} initialMethod={initialPayMethod} onClose={() => setPayable(null)} onConfirm={(value) => onPay({ ...value, sourceType: payable.type, sourceId: payable.item.id, currency: payable.item.currency })} />}
      {planningCardPayment && <CardPaymentPlanModal data={data} monthKey={monthKey} quincena={quincena} onSave={onSaveCardPaymentPlan} onClose={() => setPlanningCardPayment(false)} />}
    </section>
  );
}
