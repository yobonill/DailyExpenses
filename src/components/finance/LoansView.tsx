import { useMemo, useState, type FormEvent } from "react";
import type { LoanInput } from "../../hooks/useFinanceActions";
import { formatShortDate, toLocalDateKey } from "../../lib/date";
import { estimateLoanInterestMinor, getLoanBalance } from "../../lib/loanLedger";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type { Currency, FinancialData, Loan, LoanTransaction } from "../../models/finance";
import { CheckboxField, CurrencyField, EmptyPanel, Modal, MoneyField, PageHeading, StatusChip } from "./Shared";

function LoanForm({ data, loan, onSave, onClose }: {
  data: FinancialData;
  loan?: Loan;
  onSave: (input: LoanInput, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const hasHistory = Boolean(loan && Object.values(data.loanTransactions).some((item) => item.loanId === loan.id));
  const [name, setName] = useState(loan?.name || "");
  const [bankId, setBankId] = useState(loan?.bankId || "");
  const [currency, setCurrency] = useState<Currency>(loan?.currency || "DOP");
  const [balance, setBalance] = useState(minorToInput(loan?.openingBalanceMinor));
  const [openingDate, setOpeningDate] = useState(loan?.openingDate || toLocalDateKey());
  const [annualRate, setAnnualRate] = useState(loan ? String(loan.annualInterestRate) : "");
  const [active, setActive] = useState(loan?.active ?? true);
  const [notes, setNotes] = useState(loan?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const banks = Object.values(data.banks).filter((bank) => !bank.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "es"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const openingBalanceMinor = parseMoneyToCents(balance);
    const rate = Number(annualRate);
    if (!name.trim() || openingBalanceMinor === null || !Number.isFinite(rate) || rate < 0) return setError("Completa nombre, balance y tasa anual.");
    setSaving(true); setError("");
    try {
      await onSave({
        name,
        bankId: bankId || undefined,
        lender: bankId ? undefined : loan?.lender,
        currency,
        openingBalanceMinor,
        openingDate,
        annualInterestRate: rate,
        active,
        notes,
      }, loan?.id);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el préstamo."); }
    finally { setSaving(false); }
  };

  return <Modal title={loan ? "Editar préstamo" : "Nuevo préstamo"} onClose={onClose} confirmClose>
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Préstamo personal" /></label>
      <label className="field"><span>Banco</span><select value={bankId} onChange={(event) => setBankId(event.target.value)}><option value="">Sin vincular</option>{banks.map((bank) => <option value={bank.id} key={bank.id}>{bank.name}</option>)}</select><small className="field-help">Los bancos se administran en Más → Cuentas y productos.</small></label>
      <div className="form-columns"><MoneyField label="Balance pendiente inicial" value={balance} onChange={setBalance} currency={currency} /><CurrencyField value={currency} onChange={setCurrency} /></div>
      <div className="form-columns"><label className="field"><span>Fecha del balance</span><input type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} /></label><label className="field"><span>Tasa anual (%)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={annualRate} onChange={(event) => setAnnualRate(event.target.value)} placeholder="Ej. 18" /></label></div>
      {hasHistory && <p className="form-warning">El balance inicial, fecha y moneda no pueden modificarse porque existe historial. Usa “Ajustar al banco” para corregir el balance actual.</p>}
      <CheckboxField checked={active} onChange={setActive} label="Préstamo vigente" />
      <label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar préstamo"}</button></div>
    </form>
  </Modal>;
}

function LoanAdjustmentModal({ data, loan, onSave, onClose }: {
  data: FinancialData;
  loan: Loan;
  onSave: (loanId: string, exact: number, date: string, notes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const current = getLoanBalance(data, loan.id);
  const [amount, setAmount] = useState(minorToInput(current));
  const [date, setDate] = useState(toLocalDateKey());
  const [notes, setNotes] = useState("Balance confirmado según el banco");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const exact = parseMoneyToCents(amount);
    if (exact === null) return setError("Escribe el balance exacto.");
    setSaving(true); setError("");
    try { await onSave(loan.id, exact, date, notes); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ajustar."); }
    finally { setSaving(false); }
  };
  return <Modal title={`Ajustar · ${loan.name}`} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}><div className="form-summary"><span>Balance calculado</span><strong>{formatCurrency(current, loan.currency)}</strong></div><MoneyField label="Balance exacto según el banco" value={amount} onChange={setAmount} currency={loan.currency} /><label className="field"><span>Fecha del balance</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>Nota</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><p className="privacy-note">El sistema guardará la diferencia como ajuste. Ningún pago anterior será eliminado.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Guardar ajuste</button></div></form></Modal>;
}

const transactionLabel = (item: LoanTransaction): string => item.type === "payment" ? "Pago" : "Ajuste de balance";

export function LoansView({ data, onSave, onAdjust, onReverseAdjustment }: {
  data: FinancialData;
  onSave: (input: LoanInput, id?: string) => Promise<void>;
  onAdjust: (loanId: string, exact: number, date: string, notes?: string) => Promise<void>;
  onReverseAdjustment: (transactionId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<Loan | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Loan | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const loans = useMemo(() => Object.values(data.loans).filter((loan) => !loan.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "es")), [data.loans]);

  return <section className="finance-page">
    <PageHeading eyebrow="Deudas a plazo" title="Préstamos" action={<button className="button button-primary heading-action" type="button" onClick={() => setForm("new")}>＋ Agregar</button>} />
    {!loans.length ? <EmptyPanel title="Sin préstamos" text="Registra el balance actual de un préstamo. Después podrás vincularle facturas desde Presupuesto." /> : <div className="card-grid">{loans.map((loan) => {
      const balance = getLoanBalance(data, loan.id);
      const interest = estimateLoanInterestMinor(data, loan.id, toLocalDateKey());
      const transactions = Object.values(data.loanTransactions).filter((item) => item.loanId === loan.id && !item.reversedAt).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt));
      const bankName = (loan.bankId && data.banks[loan.bankId]?.name) || loan.lender || "Sin banco vinculado";
      return <article className="credit-card-panel loan-panel" key={loan.id}>
        <header><div><span>{bankName}</span><h2>{loan.name}</h2></div><StatusChip status={loan.active && balance > 0 ? "upcoming" : "paid"} label={balance > 0 ? loan.active ? "Vigente" : "Pausado" : "Pagado"} /></header>
        <div className="card-balance-grid"><div><span>Capital pendiente</span><strong>{formatCurrency(balance, loan.currency)}</strong></div><div><span>Interés acumulado estimado</span><strong>{formatCurrency(interest, loan.currency)}</strong><small>Tasa anual {loan.annualInterestRate}%</small></div></div>
        <p className="privacy-note">El interés es una estimación. Puedes igualar el capital con el banco en cualquier momento.</p>
        <div className="row-actions"><button className="button button-primary" type="button" onClick={() => setAdjusting(loan)}>Ajustar al banco</button><button className="button button-secondary" type="button" onClick={() => setForm(loan)}>Editar</button><button className="button button-quiet" type="button" onClick={() => setExpanded(expanded === loan.id ? null : loan.id)}>Historial ({transactions.length})</button></div>
        {expanded === loan.id && <div className="ledger-list">{transactions.length ? transactions.map((item) => <div key={item.id}><span><strong>{transactionLabel(item)}</strong><small>{formatShortDate(item.transactionDate)}</small>{item.type === "payment" && <small>Capital {formatCurrency(item.principalMinor || 0, loan.currency)} · Interés {formatCurrency(item.interestMinor || 0, loan.currency)} · Cargos {formatCurrency(item.chargesMinor || 0, loan.currency)}</small>}{item.notes && <small>{item.notes}</small>}</span><b className={item.type === "adjustment" && (item.adjustmentMinor || 0) > 0 ? "debt-up" : "debt-down"}>{formatCurrency(item.balanceAfterMinor, loan.currency)}</b>{item.type === "adjustment" && !item.linkedPaymentId && <button type="button" onClick={() => { if (window.confirm("¿Revertir este ajuste de balance?")) void onReverseAdjustment(item.id); }}>Revertir</button>}</div>) : <p>Sin movimientos.</p>}</div>}
      </article>;
    })}</div>}
    {form && <LoanForm data={data} loan={form === "new" ? undefined : form} onSave={onSave} onClose={() => setForm(null)} />}
    {adjusting && <LoanAdjustmentModal data={data} loan={adjusting} onSave={onAdjust} onClose={() => setAdjusting(null)} />}
  </section>;
}
