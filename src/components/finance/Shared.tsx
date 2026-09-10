import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatMonthTitle, formatShortDate, getMonthKey, toLocalDateKey } from "../../lib/date";
import { addDaysToDateKey } from "../../lib/financeDates";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import { estimateLoanInterestMinor, getLoanBalance } from "../../lib/loanLedger";
import { CASH_ACCOUNT_ID, calculateTransferFeeMinor, getActiveBankAccounts, getMoneyAccountBalance, isSelectableMoneyAccount, moneyAccountLabel } from "../../lib/moneyLedger";
import type { CreditCard, Currency, FinancialData, MoneyAccountId, PaymentMethod } from "../../models/finance";

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

export function MoneyAccountField({ data, method, value, onChange, label = "Cuenta de origen" }: {
  data: FinancialData;
  method: "cash" | "bankTransfer" | "debitCard";
  value: MoneyAccountId;
  onChange: (value: MoneyAccountId) => void;
  label?: string;
}) {
  const bankAccounts = getActiveBankAccounts(data);
  if (method === "cash") {
    const cash = data.moneyAccounts[CASH_ACCOUNT_ID];
    return <div className="form-summary"><span>{label}</span><strong>{cash ? `Efectivo · ${formatCurrency(getMoneyAccountBalance(data, CASH_ACCOUNT_ID), "DOP")}` : "Efectivo sin configurar"}</strong></div>;
  }
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Seleccionar banco y cuenta</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{moneyAccountLabel(account.id, data)} · {formatCurrency(getMoneyAccountBalance(data, account.id), "DOP")}</option>)}</select><small className="field-help">Se descontará exactamente de esta cuenta.</small></label>;
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

export function PostponeModal({ title, currentDueDate, onConfirm, onClose }: {
  title: string;
  currentDueDate: string;
  onConfirm: (newDueDate: string) => Promise<void>;
  onClose: () => void;
}) {
  const earliestDate = addDaysToDateKey(currentDueDate, 1);
  const [newDueDate, setNewDueDate] = useState(earliestDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!newDueDate || newDueDate <= currentDueDate) {
      setError("Selecciona una fecha posterior al vencimiento actual.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(newDueDate);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo postergar la obligación.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={`Postergar · ${title}`} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}>
    <div className="form-summary"><span>Vencimiento actual</span><strong>{formatShortDate(currentDueDate)}</strong></div>
    <label className="field"><span>Nueva fecha de vencimiento</span><input type="date" min={earliestDate} value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} required /></label>
    <p className="privacy-note">Solo se moverá esta factura. La plantilla recurrente y los próximos vencimientos no cambiarán.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Postergando…" : "Postergar factura"}</button></div>
  </form></Modal>;
}

export interface PayModalValue {
  amountMinor: number;
  paidDate: string;
  method: PaymentMethod;
  cardId?: string;
  consumeReservedSavings?: boolean;
  moneyAccountId?: MoneyAccountId;
  transferFeeMinor?: number;
  settlementAmountDopMinor?: number;
  loanPrincipalMinor?: number;
  loanInterestMinor?: number;
  loanChargesMinor?: number;
}

export function PayModal({ title, expectedMinor, currency, canPayWithCard, cards, data, loanId, allowSavings, initialMethod = "bankTransfer", onConfirm, onClose }: {
  title: string;
  expectedMinor: number;
  currency: Currency;
  canPayWithCard: boolean;
  cards: CreditCard[];
  data: FinancialData;
  loanId?: string;
  allowSavings?: boolean;
  initialMethod?: PaymentMethod;
  onConfirm: (value: PayModalValue) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(minorToInput(expectedMinor));
  const [paidDate, setPaidDate] = useState(toLocalDateKey());
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [cardId, setCardId] = useState(cards[0]?.id || "");
  const firstBankAccountId = getActiveBankAccounts(data)[0]?.id || "";
  const [moneyAccountId, setMoneyAccountId] = useState<MoneyAccountId>(initialMethod === "cash" ? CASH_ACCOUNT_ID : firstBankAccountId);
  const [consumeSavings, setConsumeSavings] = useState(Boolean(allowSavings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addTransferFee, setAddTransferFee] = useState(false);
  const [transferFee, setTransferFee] = useState("");
  const [settlementDop, setSettlementDop] = useState("");
  const linkedLoan = loanId ? data.loans[loanId] : undefined;
  const suggestedInterest = linkedLoan ? estimateLoanInterestMinor(data, linkedLoan.id, paidDate) : 0;
  const [loanInterest, setLoanInterest] = useState(linkedLoan ? minorToInput(suggestedInterest) : "");
  const [loanCharges, setLoanCharges] = useState(linkedLoan ? "0.00" : "");
  const amountMinor = parseMoneyToCents(amount) || 0;
  const feeMinor = method === "bankTransfer" && addTransferFee ? parseMoneyToCents(transferFee) || 0 : 0;
  const interestMinor = linkedLoan ? parseMoneyToCents(loanInterest) || 0 : 0;
  const chargesMinor = linkedLoan ? parseMoneyToCents(loanCharges) || 0 : 0;
  const principalMinor = linkedLoan ? Math.max(0, amountMinor - interestMinor - chargesMinor) : 0;
  const effectiveMoneyAccountId: MoneyAccountId | undefined = method === "cash" ? CASH_ACCOUNT_ID : method === "bankTransfer" || method === "debitCard" ? moneyAccountId : undefined;
  const accountDebitMinor = currency === "USD" ? parseMoneyToCents(settlementDop) || 0 : amountMinor;
  const accountReady = method === "creditCard" || (effectiveMoneyAccountId ? isSelectableMoneyAccount(data, effectiveMoneyAccountId, method as "cash" | "bankTransfer" | "debitCard") : false);
  const accountBalance = effectiveMoneyAccountId ? getMoneyAccountBalance(data, effectiveMoneyAccountId) : 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!amountMinor) return setError("Escribe un monto válido.");
    if (method === "creditCard" && !cardId) return setError("Selecciona una tarjeta activa.");
    if (method !== "creditCard" && !accountReady) return setError(method === "cash" ? "Configura primero tu saldo en Efectivo." : "Selecciona una cuenta bancaria activa.");
    if (effectiveMoneyAccountId && currency === "USD" && accountDebitMinor <= 0) return setError("Indica cuánto salió realmente en pesos.");
    if (effectiveMoneyAccountId && accountDebitMinor + feeMinor > accountBalance) return setError(`No hay suficiente dinero en ${moneyAccountLabel(effectiveMoneyAccountId, data)}.`);
    if (linkedLoan && interestMinor + chargesMinor > amountMinor) return setError("Intereses y cargos no pueden exceder el pago total.");
    if (linkedLoan && principalMinor > getLoanBalance(data, linkedLoan.id)) return setError("El capital calculado excede el balance del préstamo.");
    setSaving(true); setError("");
    try {
      await onConfirm({ amountMinor, paidDate, method, cardId: method === "creditCard" ? cardId : undefined, consumeReservedSavings: consumeSavings, moneyAccountId: effectiveMoneyAccountId, transferFeeMinor: feeMinor || undefined, settlementAmountDopMinor: currency === "USD" && effectiveMoneyAccountId ? accountDebitMinor : undefined, loanPrincipalMinor: linkedLoan ? principalMinor : undefined, loanInterestMinor: linkedLoan ? interestMinor : undefined, loanChargesMinor: linkedLoan ? chargesMinor : undefined });
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
        <label className="field"><span>¿Cómo se pagó?</span><select value={method} onChange={(event) => { const next = event.target.value as PaymentMethod; setMethod(next); if (next === "cash") setMoneyAccountId(CASH_ACCOUNT_ID); else if ((next === "bankTransfer" || next === "debitCard") && !isSelectableMoneyAccount(data, moneyAccountId, next)) setMoneyAccountId(firstBankAccountId); if (next !== "bankTransfer") { setAddTransferFee(false); setTransferFee(""); } }}><option value="bankTransfer">Transferencia bancaria</option><option value="debitCard">Tarjeta de débito</option><option value="cash">Efectivo</option>{canPayWithCard && <option value="creditCard">Tarjeta de crédito</option>}</select></label>
        {method === "creditCard" && <label className="field"><span>Tarjeta</span><select value={cardId} onChange={(event) => setCardId(event.target.value)}><option value="">Seleccionar</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.lastFour ? ` · ${card.lastFour}` : ""}</option>)}</select></label>}
        {method !== "creditCard" && <MoneyAccountField data={data} method={method as "cash" | "bankTransfer" | "debitCard"} value={effectiveMoneyAccountId || ""} onChange={setMoneyAccountId} />}
        {effectiveMoneyAccountId && currency === "USD" && <MoneyField label="Monto real que salió en pesos" value={settlementDop} onChange={setSettlementDop} currency="DOP" />}
        {method === "bankTransfer" && <><CheckboxField checked={addTransferFee} onChange={(checked) => { setAddTransferFee(checked); setTransferFee(checked ? minorToInput(calculateTransferFeeMinor(accountDebitMinor, data.settings.transferFeeRatePercent)) : ""); }} label="Agregar comisión por transferencia" help={`Calcula ${data.settings.transferFeeRatePercent}% automáticamente; puedes editarla.`} />{addTransferFee && <MoneyField label="Comisión por transferencia" value={transferFee} onChange={setTransferFee} currency="DOP" />}</>}
        {linkedLoan && <fieldset className="loan-breakdown-fieldset"><legend>Aplicación al préstamo · {linkedLoan.name}</legend><p className="privacy-note">El balance del préstamo solo baja por la porción de capital. Ajusta los valores según el comprobante del banco.</p><MoneyField label="Intereses" value={loanInterest} onChange={setLoanInterest} currency={currency} /><MoneyField label="Otros cargos" value={loanCharges} onChange={setLoanCharges} currency={currency} /><div className="form-summary"><span>Capital que reducirá la deuda</span><strong>{formatCurrency(principalMinor, currency)}</strong></div></fieldset>}
        {allowSavings && method !== "creditCard" && <CheckboxField checked={consumeSavings} onChange={setConsumeSavings} label="Usar ahorros asignados" help="Retira automáticamente el monto reservado de los fondos vinculados." />}
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
