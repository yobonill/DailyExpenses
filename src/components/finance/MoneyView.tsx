import { useMemo, useState, type FormEvent } from "react";
import type { FinancialData, MoneyAccountId } from "../../models/finance";
import type { MoneyAccountsSetupInput } from "../../hooks/useFinanceActions";
import { formatShortDate, toLocalDateKey } from "../../lib/date";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import { BANK_ACCOUNT_ID, CASH_ACCOUNT_ID, calculateTransferFeeMinor, getMoneyAccountBalance, getTotalMoneyAvailable, hasInitializedMoneyAccounts, moneyAccountLabel } from "../../lib/moneyLedger";
import { CheckboxField, EmptyPanel, Modal, MoneyField, PageHeading } from "./Shared";

function SetupModal({ onSave, onClose }: { onSave: (input: MoneyAccountsSetupInput) => Promise<void>; onClose: () => void }) {
  const [date, setDate] = useState(toLocalDateKey());
  const [bank, setBank] = useState("");
  const [cash, setCash] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const bankBalanceMinor = parseMoneyToCents(bank) ?? 0;
    const cashBalanceMinor = parseMoneyToCents(cash) ?? 0;
    if (!confirmed) return setError("Confirma que estos saldos ya incluyen los movimientos anteriores.");
    setSaving(true); setError("");
    try { await onSave({ openingDate: date, bankBalanceMinor, cashBalanceMinor }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron guardar los saldos."); }
    finally { setSaving(false); }
  };
  return <Modal title="Configurar dinero disponible" onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}><p className="privacy-note">Escribe lo que tienes realmente ahora. Los ingresos y pagos anteriores no se aplicarán otra vez.</p><label className="field"><span>Fecha de los saldos</span><input type="date" max={toLocalDateKey()} value={date} onChange={(event) => setDate(event.target.value)} /></label><MoneyField label="Dinero en Banco" value={bank} onChange={setBank} required={false} /><MoneyField label="Dinero en Efectivo" value={cash} onChange={setCash} required={false} /><CheckboxField checked={confirmed} onChange={setConfirmed} label="Estos saldos ya incluyen todos los movimientos anteriores" help="Desde esta fecha, los nuevos ingresos y pagos sí modificarán Banco o Efectivo." />{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar saldos iniciales"}</button></div></form></Modal>;
}

function AdjustModal({ data, accountId, onSave, onClose }: { data: FinancialData; accountId: MoneyAccountId; onSave: (accountId: MoneyAccountId, exact: number, date: string, notes?: string) => Promise<void>; onClose: () => void }) {
  const current = getMoneyAccountBalance(data, accountId);
  const [amount, setAmount] = useState(minorToInput(current));
  const [date, setDate] = useState(toLocalDateKey());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); const exact = parseMoneyToCents(amount); if (exact === null) return setError("Escribe el balance exacto."); setSaving(true); setError(""); try { await onSave(accountId, exact, date, notes); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ajustar."); } finally { setSaving(false); } };
  return <Modal title={`Ajustar ${moneyAccountLabel(accountId)}`} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}><div className="form-summary"><span>Balance calculado</span><strong>{formatCurrency(current, "DOP")}</strong></div><MoneyField label="Balance exacto actual" value={amount} onChange={setAmount} /><label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>Motivo o nota</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Balance confirmado en la aplicación del banco" /></label><p className="privacy-note">Se registrará la diferencia como un ajuste y se conservará el historial anterior.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Guardar ajuste</button></div></form></Modal>;
}

function TransferModal({ data, onSave, onClose }: { data: FinancialData; onSave: (from: MoneyAccountId, to: MoneyAccountId, amount: number, date: string, fee: number, notes?: string) => Promise<void>; onClose: () => void }) {
  const [from, setFrom] = useState<MoneyAccountId>(BANK_ACCOUNT_ID);
  const to: MoneyAccountId = from === BANK_ACCOUNT_ID ? CASH_ACCOUNT_ID : BANK_ACCOUNT_ID;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toLocalDateKey());
  const [includeFee, setIncludeFee] = useState(false);
  const parsedAmount = parseMoneyToCents(amount) || 0;
  const automaticFee = calculateTransferFeeMinor(parsedAmount, data.settings.transferFeeRatePercent);
  const [manualFee, setManualFee] = useState("");
  const fee = includeFee ? parseMoneyToCents(manualFee) ?? automaticFee : 0;
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggleFee = (checked: boolean) => { setIncludeFee(checked); if (checked) setManualFee(minorToInput(automaticFee)); else setManualFee(""); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!parsedAmount) return setError("Escribe un monto válido."); setSaving(true); setError(""); try { await onSave(from, to, parsedAmount, date, fee, notes); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo mover el dinero."); } finally { setSaving(false); } };
  return <Modal title="Mover dinero" onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}><label className="field"><span>Movimiento</span><select value={from} onChange={(event) => { setFrom(event.target.value as MoneyAccountId); setIncludeFee(false); setManualFee(""); }}><option value="bank">Retirar: Banco → Efectivo</option><option value="cash">Depositar: Efectivo → Banco</option></select></label><div className="form-summary"><span>Disponible en {moneyAccountLabel(from)}</span><strong>{formatCurrency(getMoneyAccountBalance(data, from), "DOP")}</strong></div><MoneyField label="Monto" value={amount} onChange={(value) => { setAmount(value); if (includeFee) setManualFee(minorToInput(calculateTransferFeeMinor(parseMoneyToCents(value) || 0, data.settings.transferFeeRatePercent))); }} /><label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{from === BANK_ACCOUNT_ID && <><CheckboxField checked={includeFee} onChange={toggleFee} label="Agregar comisión por transferencia" help={`Calcula ${data.settings.transferFeeRatePercent}% y permite editar el resultado.`} />{includeFee && <MoneyField label="Comisión" value={manualFee} onChange={setManualFee} required={false} />}</>}<label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Confirmar movimiento</button></div></form></Modal>;
}

const movementLabel = (type: string): string => ({ income: "Ingreso", payment: "Pago", expense: "Gasto", cardPayment: "Pago de tarjeta", loanPayment: "Pago de préstamo", transfer: "Movimiento interno", fee: "Comisión", adjustment: "Ajuste" })[type] || "Movimiento";

export function MoneyView({ data, onInitialize, onAdjust, onTransfer }: { data: FinancialData; onInitialize: (input: MoneyAccountsSetupInput) => Promise<void>; onAdjust: (accountId: MoneyAccountId, exact: number, date: string, notes?: string) => Promise<void>; onTransfer: (from: MoneyAccountId, to: MoneyAccountId, amount: number, date: string, fee: number, notes?: string) => Promise<void> }) {
  const initialized = hasInitializedMoneyAccounts(data);
  const [setup, setSetup] = useState(false);
  const [adjusting, setAdjusting] = useState<MoneyAccountId | null>(null);
  const [transferring, setTransferring] = useState(false);
  const transactions = useMemo(() => Object.values(data.moneyTransactions).filter((item) => !item.reversedAt).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt)), [data.moneyTransactions]);
  return <section className="finance-page"><PageHeading eyebrow="Dinero real" title="Disponible" action={initialized ? <button className="button button-primary heading-action" type="button" onClick={() => setTransferring(true)}>Mover dinero</button> : <button className="button button-primary heading-action" type="button" onClick={() => setSetup(true)}>Configurar saldos</button>} />{!initialized ? <EmptyPanel title="Define tu punto de partida" text="Registra cuánto tienes exactamente en Banco y Efectivo. Los movimientos anteriores ya registrados no se duplicarán." /> : <><div className="projection-grid money-balance-grid"><article className="projection-card"><span>Banco</span><strong>{formatCurrency(getMoneyAccountBalance(data, BANK_ACCOUNT_ID), "DOP")}</strong><button className="text-button" type="button" onClick={() => setAdjusting(BANK_ACCOUNT_ID)}>Ajustar balance</button></article><article className="projection-card"><span>Efectivo</span><strong>{formatCurrency(getMoneyAccountBalance(data, CASH_ACCOUNT_ID), "DOP")}</strong><button className="text-button" type="button" onClick={() => setAdjusting(CASH_ACCOUNT_ID)}>Ajustar balance</button></article><article className="projection-card projection-card-featured positive"><span>Total real disponible</span><strong>{formatCurrency(getTotalMoneyAvailable(data), "DOP")}</strong><small>Saldo actual, no proyección.</small></article></div><section className="management-section"><div className="section-title-row"><div><span className="eyebrow">Trazabilidad</span><h2>Historial de dinero</h2></div></div>{transactions.length ? <div className="ledger-list">{transactions.map((item) => <div key={item.id}><span><strong>{item.description}</strong><small>{formatShortDate(item.transactionDate)} · {moneyAccountLabel(item.accountId)} · {movementLabel(item.type)}</small>{item.notes && <small>{item.notes}</small>}</span><b className={item.direction === "in" ? "debt-down" : "debt-up"}>{item.direction === "in" ? "+" : "−"}{formatCurrency(item.amountMinor, "DOP")}</b></div>)}</div> : <p className="muted-panel">Todavía no hay movimientos posteriores al saldo inicial.</p>}</section></>}{setup && <SetupModal onSave={onInitialize} onClose={() => setSetup(false)} />}{adjusting && <AdjustModal data={data} accountId={adjusting} onSave={onAdjust} onClose={() => setAdjusting(null)} />}{transferring && <TransferModal data={data} onSave={onTransfer} onClose={() => setTransferring(false)} />}</section>;
}
