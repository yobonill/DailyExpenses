import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatMonthTitle, formatShortDate, getMonthKey, toLocalDateKey } from "../../lib/date";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type { CreditCard, Currency, PaymentMethod } from "../../models/finance";

export function PageHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="finance-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      {action}
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false, confirmClose = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; confirmClose?: boolean }) {
  const requestClose = () => {
    if (!confirmClose || window.confirm("¿Descartar los cambios de este formulario?")) onClose();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClose, onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" onClick={requestClose} aria-label="Cerrar">×</button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function MoneyField({ label, value, onChange, currency = "DOP", required = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  currency?: Currency;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="money-input-wrap compact-money"><span aria-hidden="true">{currency === "USD" ? "US$" : "RD$"}</span>
        <input type="text" inputMode="decimal" value={value} required={required} onChange={(event) => onChange(event.target.value)} placeholder="0.00" />
      </div>
    </label>
  );
}

export function CurrencyField({ value, onChange, label = "Moneda" }: { value: Currency; onChange: (value: Currency) => void; label?: string }) {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as Currency)}>
        <option value="DOP">Pesos dominicanos (DOP)</option>
        <option value="USD">Dólares (USD)</option>
      </select>
    </label>
  );
}

export function CheckboxField({ checked, onChange, label, help }: { checked: boolean; onChange: (checked: boolean) => void; label: string; help?: string }) {
  return (
    <label className="checkbox-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{help && <small>{help}</small>}</span>
    </label>
  );
}

export function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="empty-state compact-empty"><div className="empty-icon" aria-hidden="true">○</div><h2>{title}</h2><p>{text}</p></div>;
}

export function PeriodSelector({ monthKey, onMonthChange, quincena, onQuincenaChange }: {
  monthKey: string;
  onMonthChange: (value: string) => void;
  quincena: "all" | 1 | 2;
  onQuincenaChange: (value: "all" | 1 | 2) => void;
}) {
  return (
    <div className="period-toolbar">
      <label className="field compact-field"><span>Mes financiero</span><input type="month" value={monthKey} onChange={(event) => onMonthChange(event.target.value)} /></label>
      <div className="period-segments compact-segments">
        <button type="button" className={quincena === "all" ? "active" : ""} onClick={() => onQuincenaChange("all")}>Mes</button>
        <button type="button" className={quincena === 1 ? "active" : ""} onClick={() => onQuincenaChange(1)}>Q1</button>
        <button type="button" className={quincena === 2 ? "active" : ""} onClick={() => onQuincenaChange(2)}>Q2</button>
      </div>
      <button type="button" className="text-button" onClick={() => onMonthChange(getMonthKey(toLocalDateKey()))}>Hoy</button>
    </div>
  );
}

export const statusClass = (status: string): string => {
  if (status === "overdue") return "status-danger";
  if (status === "dueToday" || status === "dueSoon" || status === "partial") return "status-warning";
  if (status === "paid" || status === "received" || status === "funded") return "status-success";
  if (status === "cancelled") return "status-muted";
  return "status-neutral";
};

export function StatusChip({ status, label }: { status: string; label: string }) {
  return <span className={`status-chip ${statusClass(status)}`}>{label}</span>;
}

export interface PayModalValue {
  amountMinor: number;
  paidDate: string;
  method: PaymentMethod;
  cardId?: string;
  consumeReservedSavings?: boolean;
}

export function PayModal({ title, expectedMinor, currency, canPayWithCard, cards, allowSavings, initialMethod = "cash", onConfirm, onClose }: {
  title: string;
  expectedMinor: number;
  currency: Currency;
  canPayWithCard: boolean;
  cards: CreditCard[];
  allowSavings?: boolean;
  initialMethod?: PaymentMethod;
  onConfirm: (value: PayModalValue) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(minorToInput(expectedMinor));
  const [paidDate, setPaidDate] = useState(toLocalDateKey());
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const [consumeSavings, setConsumeSavings] = useState(Boolean(allowSavings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = parseMoneyToCents(amount);
    if (!amountMinor) return setError("Escribe un monto válido.");
    if (method === "creditCard" && !cardId) return setError("Selecciona una tarjeta activa.");
    setSaving(true); setError("");
    try {
      await onConfirm({ amountMinor, paidDate, method, cardId: method === "creditCard" ? cardId : undefined, consumeReservedSavings: consumeSavings });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar el pago.");
    } finally { setSaving(false); }
  };
  return (
    <Modal title={`Pagar · ${title}`} onClose={onClose} confirmClose>
      <form className="form-grid" onSubmit={submit}>
        <div className="form-summary"><span>Monto esperado</span><strong>{formatCurrency(expectedMinor, currency)}</strong></div>
        <MoneyField label="Monto pagado" value={amount} onChange={setAmount} currency={currency} />
        <label className="field"><span>Fecha de pago</span><input type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} /></label>
        {canPayWithCard && (
          <fieldset className="choice-field"><legend>Método</legend>
            <label><input type="radio" checked={method === "cash"} onChange={() => setMethod("cash")} /> Pago normal</label>
            <label><input type="radio" checked={method === "creditCard"} onChange={() => setMethod("creditCard")} /> Tarjeta de crédito</label>
          </fieldset>
        )}
        {method === "creditCard" && <label className="field"><span>Tarjeta</span><select value={cardId} onChange={(event) => setCardId(event.target.value)}><option value="">Seleccionar</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.lastFour ? ` · ${card.lastFour}` : ""}</option>)}</select></label>}
        {allowSavings && method === "cash" && <CheckboxField checked={consumeSavings} onChange={setConsumeSavings} label="Usar ahorros asignados" help="Retira automáticamente el monto reservado de los fondos vinculados." />}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Confirmar pago"}</button></div>
      </form>
    </Modal>
  );
}

export function FinancialMonthLabel({ monthKey }: { monthKey: string }) {
  return <span>{formatMonthTitle(monthKey)}</span>;
}

export function DateMeta({ dateKey }: { dateKey: string }) {
  return <span>{formatShortDate(dateKey)}</span>;
}
