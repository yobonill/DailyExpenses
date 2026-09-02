import { useMemo, useState, type FormEvent } from "react";
import { EXPENSE_CATEGORIES } from "../../config/financeCategories";
import type { PurchaseGoalInput } from "../../hooks/useFinanceActions";
import { formatShortDate, toLocalDateKey } from "../../lib/date";
import {
  getFundAllocated,
  getFundBalance,
  getPurchaseGoalReserved,
} from "../../lib/financialCalculations";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type {
  CreditCard,
  Currency,
  FinancialData,
  PurchaseGoal,
  PurchaseGoalPriority,
} from "../../models/finance";
import {
  CheckboxField,
  CurrencyField,
  EmptyPanel,
  Modal,
  MoneyField,
  PageHeading,
  StatusChip,
} from "./Shared";

const priorityLabel = (priority: PurchaseGoalPriority): string => ({
  low: "Baja",
  medium: "Media",
  high: "Alta",
})[priority];

const goalStatus = (goal: PurchaseGoal, reserved: number) => {
  if (goal.status === "scheduled") return { label: "Programada", status: "dueSoon" };
  if (goal.status === "purchased") return { label: "Comprada", status: "paid" };
  if (goal.status === "discarded") return { label: "Descartada", status: "cancelled" };
  if (reserved >= goal.estimatedAmountMinor) return { label: "Lista para comprar", status: "paid" };
  if (reserved > 0) return { label: "Ahorrando", status: "partial" };
  return { label: "Deseada", status: "upcoming" };
};

function GoalForm({
  goal,
  onSave,
  onClose,
}: {
  goal?: PurchaseGoal;
  onSave: (input: PurchaseGoalInput, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(goal?.name || "");
  const [amount, setAmount] = useState(minorToInput(goal?.estimatedAmountMinor));
  const [currency, setCurrency] = useState<Currency>(goal?.currency || "DOP");
  const [priority, setPriority] = useState<PurchaseGoalPriority>(goal?.priority || "medium");
  const [category, setCategory] = useState(goal?.category || "");
  const [notes, setNotes] = useState(goal?.notes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const estimatedAmountMinor = parseMoneyToCents(amount);
    if (!name.trim() || !estimatedAmountMinor) {
      setError("Escribe el nombre y un precio estimado válido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name, estimatedAmountMinor, currency, priority, category: category || undefined, notes }, goal?.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={goal ? "Editar meta de compra" : "Nueva meta de compra"} onClose={onClose} confirmClose>
      <form className="form-grid" onSubmit={submit}>
        <label className="field"><span>¿Qué quieres comprar?</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Televisor nuevo" /></label>
        <MoneyField label="Precio estimado" value={amount} onChange={setAmount} currency={currency} />
        <CurrencyField value={currency} onChange={setCurrency} />
        <label className="field"><span>Prioridad</span><select value={priority} onChange={(event) => setPriority(event.target.value as PurchaseGoalPriority)}><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
        <label className="field"><span>Categoría (opcional)</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Sin categoría</option>{EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="field"><span>Notas (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <p className="privacy-note">Esta meta no tiene fecha y no afectará las proyecciones hasta que decidas programarla.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar meta"}</button></div>
      </form>
    </Modal>
  );
}

function AllocateModal({
  data,
  goal,
  onAllocate,
  onClose,
}: {
  data: FinancialData;
  goal: PurchaseGoal;
  onAllocate: (fundId: string, goalId: string, amountMinor: number) => Promise<void>;
  onClose: () => void;
}) {
  const funds = Object.values(data.savingsFunds).filter((fund) => fund.active && !fund.archivedAt && fund.currency === goal.currency);
  const [fundId, setFundId] = useState(funds[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reserved = getPurchaseGoalReserved(data, goal.id);
  const remaining = Math.max(0, goal.estimatedAmountMinor - reserved);
  const selectedFund = data.savingsFunds[fundId];
  const available = selectedFund ? getFundBalance(data, fundId) - getFundAllocated(data, fundId) : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = parseMoneyToCents(amount);
    if (!fundId || !amountMinor) return setError("Selecciona un fondo y escribe un monto válido.");
    setSaving(true);
    setError("");
    try {
      await onAllocate(fundId, goal.id, amountMinor);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo reservar el ahorro.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Reservar ahorro · ${goal.name}`} onClose={onClose}>
      {!funds.length ? <div className="validation-list"><p className="validation-warning">Primero crea un fondo activo en {goal.currency} y deposita dinero desde la sección Ahorros.</p><div className="modal-actions"><button type="button" className="button button-primary" onClick={onClose}>Entendido</button></div></div> : (
        <form className="form-grid" onSubmit={submit}>
          <div className="form-summary"><span>Falta para completar la meta</span><strong>{formatCurrency(remaining, goal.currency)}</strong></div>
          <label className="field"><span>Fondo</span><select value={fundId} onChange={(event) => setFundId(event.target.value)}>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select><small className="field-help">Disponible sin asignar: {formatCurrency(available, goal.currency)}</small></label>
          <MoneyField label="Monto que reservarás" value={amount} onChange={setAmount} currency={goal.currency} />
          <p className="privacy-note">Reservar no crea un gasto ni modifica las proyecciones. Solo evita usar ese ahorro para otra obligación.</p>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Reservar"}</button></div>
        </form>
      )}
    </Modal>
  );
}

function ScheduleModal({ goal, onSchedule, onClose }: { goal: PurchaseGoal; onSchedule: (goalId: string, dueDate: string) => Promise<void>; onClose: () => void }) {
  const [date, setDate] = useState(toLocalDateKey());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Selecciona una fecha.");
    setSaving(true);
    try { await onSchedule(goal.id, date); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo programar."); } finally { setSaving(false); }
  };
  return <Modal title={`Programar compra · ${goal.name}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><div className="form-summary"><span>Precio estimado</span><strong>{formatCurrency(goal.estimatedAmountMinor, goal.currency)}</strong></div><label className="field"><span>Fecha estimada de compra</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><p className="privacy-note">La meta se convertirá en un gasto no mensual y comenzará a afectar las proyecciones.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Programando…" : "Programar"}</button></div></form></Modal>;
}

function PurchaseModal({
  goal,
  cards,
  onCash,
  onCard,
  onClose,
}: {
  goal: PurchaseGoal;
  cards: CreditCard[];
  onCash: (goal: PurchaseGoal, actualAmountMinor: number, actualPaymentDopMinor: number, date: string) => Promise<void>;
  onCard: (goalId: string, actualAmountMinor: number, date: string, cardId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<"cash" | "creditCard">("cash");
  const [amount, setAmount] = useState(minorToInput(goal.estimatedAmountMinor));
  const [dopAmount, setDopAmount] = useState("");
  const [date, setDate] = useState(toLocalDateKey());
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const actualAmountMinor = parseMoneyToCents(amount);
    if (!actualAmountMinor) return setError("Escribe el precio real de la compra.");
    const actualPaymentDopMinor = goal.currency === "DOP" ? actualAmountMinor : parseMoneyToCents(dopAmount);
    if (method === "cash" && !actualPaymentDopMinor) return setError("Escribe cuánto pagaste realmente en pesos.");
    if (method === "creditCard" && !cardId) return setError("Selecciona una tarjeta activa.");
    setSaving(true);
    setError("");
    try {
      if (method === "cash") await onCash(goal, actualAmountMinor, actualPaymentDopMinor as number, date);
      else await onCard(goal.id, actualAmountMinor, date, cardId);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Registrar compra · ${goal.name}`} onClose={onClose} confirmClose>
      <form className="form-grid" onSubmit={submit}>
        <MoneyField label={`Precio real en ${goal.currency}`} value={amount} onChange={setAmount} currency={goal.currency} />
        <label className="field"><span>Fecha de compra</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <fieldset className="choice-field"><legend>Método</legend><label><input type="radio" checked={method === "cash"} onChange={() => setMethod("cash")} /> Efectivo, débito o transferencia</label><label><input type="radio" checked={method === "creditCard"} onChange={() => setMethod("creditCard")} /> Tarjeta de crédito</label></fieldset>
        {method === "cash" && goal.currency === "USD" && <MoneyField label="Monto real pagado en pesos" value={dopAmount} onChange={setDopAmount} currency="DOP" />}
        {method === "creditCard" && <label className="field"><span>Tarjeta</span><select value={cardId} onChange={(event) => setCardId(event.target.value)}><option value="">Seleccionar</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.lastFour ? ` · ${card.lastFour}` : ""}</option>)}</select><small className="field-help">El cargo se registrará en {goal.currency}. Los ahorros reservados permanecerán cubriendo esa deuda.</small></label>}
        {method === "cash" && <p className="privacy-note">La compra se añadirá automáticamente como gasto diario registrado en DOP y consumirá los ahorros reservados.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Registrando…" : "Registrar compra"}</button></div>
      </form>
    </Modal>
  );
}

export function PurchaseGoalsView({
  data,
  onSave,
  onAllocate,
  onSchedule,
  onPurchaseCash,
  onPurchaseCard,
  onDiscard,
  onRelease,
}: {
  data: FinancialData;
  onSave: (input: PurchaseGoalInput, id?: string) => Promise<void>;
  onAllocate: (fundId: string, goalId: string, amountMinor: number) => Promise<void>;
  onSchedule: (goalId: string, dueDate: string) => Promise<void>;
  onPurchaseCash: (goal: PurchaseGoal, actualAmountMinor: number, actualPaymentDopMinor: number, date: string) => Promise<void>;
  onPurchaseCard: (goalId: string, actualAmountMinor: number, date: string, cardId: string) => Promise<void>;
  onDiscard: (goalId: string) => Promise<void>;
  onRelease: (allocationId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<PurchaseGoal | "new" | null>(null);
  const [allocationGoal, setAllocationGoal] = useState<PurchaseGoal | null>(null);
  const [scheduleGoal, setScheduleGoal] = useState<PurchaseGoal | null>(null);
  const [purchaseGoal, setPurchaseGoal] = useState<PurchaseGoal | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const goals = useMemo(() => Object.values(data.purchaseGoals).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] || a.name.localeCompare(b.name);
  }), [data.purchaseGoals]);
  const visible = goals.filter((goal) => showHistory
    || goal.status === "active"
    || goal.status === "scheduled"
    || getPurchaseGoalReserved(data, goal.id) > 0);
  const activeCards = Object.values(data.creditCards).filter((card) => card.active && !card.archivedAt);
  const total = (currency: Currency) => goals.filter((goal) => goal.status === "active" && goal.currency === currency).reduce((sum, goal) => sum + goal.estimatedAmountMinor, 0);
  const reserved = (currency: Currency) => goals.filter((goal) => goal.status === "active" && goal.currency === currency).reduce((sum, goal) => sum + getPurchaseGoalReserved(data, goal.id), 0);

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Compras sin fecha" title="Metas de compra" action={<button className="button button-primary heading-action" type="button" onClick={() => setForm("new")}>＋ Meta</button>} />
      <p className="period-caption">Las metas no reducen tus proyecciones. Solo lo harán cuando las programes con una fecha.</p>
      <div className="projection-grid">
        <article className="projection-card"><span>Metas activas DOP</span><strong>{formatCurrency(total("DOP"), "DOP")}</strong><small>Reservado {formatCurrency(reserved("DOP"), "DOP")}</small></article>
        <article className="projection-card"><span>Metas activas USD</span><strong>{formatCurrency(total("USD"), "USD")}</strong><small>Reservado {formatCurrency(reserved("USD"), "USD")}</small></article>
      </div>
      <div className="list-toolbar"><CheckboxField checked={showHistory} onChange={setShowHistory} label="Mostrar compradas y descartadas" /></div>
      {!visible.length ? <EmptyPanel title="Sin metas de compra" text="Agrega algo que quieres comprar aunque todavía no sepas cuándo podrás hacerlo." /> : (
        <div className="finance-list">
          {visible.map((goal) => {
            const saved = getPurchaseGoalReserved(data, goal.id);
            const remaining = Math.max(0, goal.estimatedAmountMinor - saved);
            const percent = Math.min(100, Math.round((saved / goal.estimatedAmountMinor) * 100));
            const status = goalStatus(goal, saved);
            const allocations = Object.values(data.savingsAllocations).filter((allocation) => allocation.obligationType === "purchaseGoal" && allocation.obligationId === goal.id && allocation.active && !allocation.releasedAt && !allocation.consumedAt);
            return (
              <article className="finance-row-card goal-card" key={goal.id}>
                <div className="finance-row-main">
                  <div>
                    <div className="goal-title-row"><h3>{goal.name}</h3><StatusChip status={status.status} label={status.label} /></div>
                    <p>Prioridad {priorityLabel(goal.priority)}{goal.category ? ` · ${goal.category}` : ""}</p>
                    {goal.status === "active" && <><progress className="goal-progress" value={saved} max={goal.estimatedAmountMinor} /><small>{formatCurrency(saved, goal.currency)} reservado · Falta {formatCurrency(remaining, goal.currency)} · {percent}%</small></>}
                    {goal.status === "scheduled" && goal.scheduledOccurrenceId && <small>Programada para {formatShortDate(data.nonMonthlyOccurrences[goal.scheduledOccurrenceId]?.dueDate || "")}</small>}
                    {goal.status === "purchased" && <small>Comprada {goal.purchasedAt ? formatShortDate(goal.purchasedAt) : ""} · {formatCurrency(goal.actualAmountMinor || goal.estimatedAmountMinor, goal.currency)}</small>}
                    {goal.notes && <small>{goal.notes}</small>}
                    {allocations.length > 0 && <div className="goal-allocation-list">{allocations.map((allocation) => <span key={allocation.id}>{data.savingsFunds[allocation.fundId]?.name || "Fondo"}: {formatCurrency(allocation.amountMinor, allocation.currency)} <button type="button" onClick={() => void onRelease(allocation.id)}>Liberar</button></span>)}</div>}
                  </div>
                  <strong>{formatCurrency(goal.estimatedAmountMinor, goal.currency)}</strong>
                </div>
                {goal.status === "active" && <div className="row-actions"><button className="button button-primary" type="button" onClick={() => setAllocationGoal(goal)} disabled={remaining <= 0}>Reservar ahorro</button><button className="button button-secondary" type="button" onClick={() => setScheduleGoal(goal)}>Programar</button><button className="button button-secondary" type="button" onClick={() => setPurchaseGoal(goal)}>Registrar compra</button><button className="button button-quiet" type="button" onClick={() => setForm(goal)}>Editar</button><button className="button button-quiet danger-text" type="button" onClick={() => { if (window.confirm(`¿Descartar la meta “${goal.name}” y liberar sus ahorros reservados?`)) void onDiscard(goal.id); }}>Descartar</button></div>}
              </article>
            );
          })}
        </div>
      )}
      {form && <GoalForm goal={form === "new" ? undefined : form} onSave={onSave} onClose={() => setForm(null)} />}
      {allocationGoal && <AllocateModal data={data} goal={allocationGoal} onAllocate={onAllocate} onClose={() => setAllocationGoal(null)} />}
      {scheduleGoal && <ScheduleModal goal={scheduleGoal} onSchedule={onSchedule} onClose={() => setScheduleGoal(null)} />}
      {purchaseGoal && <PurchaseModal goal={purchaseGoal} cards={activeCards} onCash={onPurchaseCash} onCard={onPurchaseCard} onClose={() => setPurchaseGoal(null)} />}
    </section>
  );
}
