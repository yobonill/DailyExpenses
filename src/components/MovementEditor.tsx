import { useState } from "react";
import type { FinancialData, PaymentMethod, Currency } from "../models/finance";
import type { AppUserDefinition } from "../config/appUsers";
import { buildMovementEdit, type MovementTarget, type MovementEdit } from "../lib/movementEditing";
import { balancesAt } from "../lib/financialReview";
import { applyFinancialUpdates } from "../lib/financialState";
import { toLocalDateKey } from "../lib/date";
import { EXPENSE_CATEGORIES } from "../config/financeCategories";
import { formatCurrency, parseMoneyToCents, minorToInput } from "../lib/money";
import { moneyAccountLabel } from "../lib/moneyLedger";
import { Modal, MoneyField } from "./finance/Shared";

export function MovementEditor({data, user, target, onCommit, onClose}: {
  data: FinancialData; user: AppUserDefinition; target: MovementTarget;
  onCommit: (updates: Record<string,unknown>) => Promise<void>; onClose: () => void;
}) {
  const payment = target.source === "payment" ? data.payments[target.sourceId] : undefined;
  const occurrence = payment ? (payment.sourceType === "monthly" ? data.monthlyOccurrences : data.nonMonthlyOccurrences)[payment.sourceId] : undefined;
  const savings = target.source === "savingsTransaction" ? data.savingsTransactions[target.sourceId] : undefined;
  const card = target.source === "cardTransaction" ? data.cardTransactions[target.sourceId] : undefined;
  const money = target.source === "moneyTransaction" ? data.moneyTransactions[target.sourceId] : undefined;
  const loan = payment?.loanTransactionId ? data.loanTransactions[payment.loanTransactionId] : undefined;
  const savedFund = payment?.savingsTransactionIds?.map(id => data.savingsTransactions[id]).find(t => t?.type === "deposit")?.fundId
    || (card ? Object.values(data.savingsTransactions).find(t=>t.linkedCardTransactionId===card.id && !t.reversedAt)?.fundId : undefined);
  const historical = Boolean(payment?.historical);
  const [date, setDate] = useState(payment?.reportingExactDate || (historical ? "" : payment?.paidDate) || savings?.transactionDate || card?.transactionDate || money?.transactionDate || "");
  const [name, setName] = useState(occurrence?.name || card?.description || money?.description || "Movimiento de ahorro");
  const [category, setCategory] = useState(occurrence?.category || card?.category || (savings ? "Ahorros" : "Comisiones bancarias"));
  const [amount, setAmount] = useState(minorToInput(payment?.amountMinor || savings?.amountMinor || card?.amountMinor || money?.amountMinor || 0));
  const [currency, setCurrency] = useState<Currency>(payment?.currency || savings?.currency || card?.currency || money?.currency || "DOP");
  const [method, setMethod] = useState<PaymentMethod>(payment?.reportingMethod || payment?.method || card?.paymentMethod || (card?.type === "charge" ? "creditCard" : "bankTransfer"));
  const [accountId, setAccountId] = useState(payment?.reportingMoneyAccountId || payment?.moneyAccountId || card?.moneyAccountId || money?.accountId || "");
  const [cardId, setCardId] = useState(payment?.reportingCardId || payment?.cardId || card?.cardId || "");
  const [fundId, setFundId] = useState(savedFund || savings?.fundId || "");
  const [fee, setFee] = useState(minorToInput(payment?.transferFeeMinor || card?.transferFeeMinor || 0));
  const [settlement, setSettlement] = useState(minorToInput(payment?.settlementAmountDopMinor || card?.settlementAmountDopMinor || 0));
  const [interest, setInterest] = useState(minorToInput(loan?.interestMinor || 0));
  const [charges, setCharges] = useState(minorToInput(loan?.chargesMinor || 0));
  const [notes, setNotes] = useState(payment?.notes || savings?.notes || card?.notes || "");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewBase, setPreviewBase] = useState(data);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reversing,setReversing] = useState(false);
  const isSavings = Boolean(savings || category === "Ahorros");
  const input: MovementEdit = { date, name, category, amountMinor: parseMoneyToCents(amount) || 0, currency, method, accountId, cardId, fundId,
    feeMinor: parseMoneyToCents(fee) || 0, settlementMinor: parseMoneyToCents(settlement) || 0,
    interestMinor: parseMoneyToCents(interest) || 0, chargesMinor: parseMoneyToCents(charges) || 0, notes };
  const build = async (reverse = false) => {
    setError("");
    try {
      if (reverse && !window.confirm("¿Revertir este movimiento y sus efectos vinculados? Se conservará el registro anterior.")) return;
      // An undated historical reversal does not invent a new reporting date.
      setPreview(await buildMovementEdit(data,user,target,{...input,date: input.date || (reverse ? payment?.paidDate || toLocalDateKey() : "")},reverse));
      setReversing(reverse);
      setPreviewBase(data);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo preparar la corrección."); }
  };
  const save = async () => {
    if (!preview) return;
    if (previewBase !== data) { setPreview(null); setError("Los datos cambiaron. Revisa nuevamente la vista previa."); return; }
    setBusy(true);
    try { await onCommit(preview); onClose(); } catch(e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setBusy(false); }
  };
  const beforeBalances = balancesAt(data,toLocalDateKey());
  const afterBalances = preview ? balancesAt(applyFinancialUpdates(data,preview),toLocalDateKey()) : [];
  return <Modal title={`Corregir · ${occurrence?.name || name}`} onClose={onClose} wide confirmClose>
    {historical && <p className="form-warning">Pago anterior al seguimiento. Esta corrección actualiza el historial y la obligación, sin descontar nuevamente saldos actuales.</p>}
    {preview ? <><p>Se conservará la versión anterior. Los cambios afectan este movimiento; no las plantillas futuras.</p>
      <p><strong>{name}</strong> · {formatCurrency(payment?.amountMinor || savings?.amountMinor || card?.amountMinor || money?.amountMinor || 0,currency)} → {reversing?"Movimiento revertido":formatCurrency(input.amountMinor,currency)} · Fecha: {input.date || "Conservada"}</p>
      <div className="table-scroll"><table><thead><tr><th>Cuenta o tarjeta</th><th>Antes</th><th>Después</th></tr></thead><tbody>{beforeBalances.map(b => {const a = afterBalances.find(x=>x.key===b.key); return <tr key={b.key}><td>{b.name}</td><td>{formatCurrency(b.calculatedMinor,b.currency)}</td><td>{formatCurrency(a?.calculatedMinor || 0,b.currency)}{a && a.reservedMinor !== b.reservedMinor && <small> Apartado: {formatCurrency(b.reservedMinor,b.currency)} → {formatCurrency(a.reservedMinor,b.currency)}</small>}</td></tr>;})}</tbody></table></div>
      <div className="modal-actions"><button className="button button-secondary" onClick={()=>setPreview(null)}>Volver a editar</button><button className="button button-primary" disabled={busy} onClick={()=>void save()}>Confirmar corrección</button></div>
    </> : <form className="form-grid" onSubmit={e=>{e.preventDefault();void build();}}>
      <label className="field"><span>Fecha real</span><input type="date" required max={toLocalDateKey()} value={date} onChange={e=>setDate(e.target.value)} /></label>
      {!payment && !savings && <label className="field"><span>Descripción</span><input required value={name} onChange={e=>setName(e.target.value)} /></label>}
      <MoneyField label="Monto real" value={amount} onChange={setAmount} currency={currency} />
      {card && <label className="field"><span>Moneda</span><select value={currency} onChange={e=>setCurrency(e.target.value as Currency)}><option>DOP</option><option>USD</option></select></label>}
      {!savings && <label className="field"><span>Categoría de este movimiento</span><select required value={category} onChange={e=>setCategory(e.target.value)}><option value="">Seleccionar categoría</option>{[...new Set([...EXPENSE_CATEGORIES,category])].filter(Boolean).map(c=><option key={c}>{c}</option>)}</select></label>}
      {isSavings && !historical ? <label className="field"><span>Fondo y cuenta de destino</span><select required value={fundId} onChange={e=>setFundId(e.target.value)}><option value="">Seleccionar fondo</option>{Object.values(data.savingsFunds).filter(f=>f.currency===currency).map(f=><option key={f.id} value={f.id}>{f.name} · {f.moneyAccountId ? moneyAccountLabel(f.moneyAccountId,data) : "Sin cuenta"}</option>)}</select></label> : <>
        <label className="field"><span>Forma de pago</span><select value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)}><option value="cash">Efectivo</option><option value="debitCard">Tarjeta de débito</option><option value="bankTransfer">Transferencia</option>{card?.type !== "payment" && <option value="creditCard">Tarjeta de crédito</option>}</select></label>
        {method !== "cash" && method !== "creditCard" && <label className="field"><span>Cuenta utilizada</span><select required value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Seleccionar cuenta</option>{Object.values(data.moneyAccounts).filter(a=>a.kind==="bank").map(a=><option key={a.id} value={a.id}>{moneyAccountLabel(a.id,data)}</option>)}</select></label>}
        {(method === "creditCard" || card) && <label className="field"><span>Tarjeta</span><select required value={cardId} onChange={e=>setCardId(e.target.value)}><option value="">Seleccionar tarjeta</option>{Object.values(data.creditCards).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {method === "bankTransfer" && !historical && <MoneyField label="Comisión de transferencia (opcional)" required={false} value={fee} onChange={setFee} />}
        {currency === "USD" && method !== "creditCard" && !historical && <MoneyField label="Monto realmente retirado en DOP" value={settlement} onChange={setSettlement} />}
      </>}
      {loan && <><MoneyField label="Intereses" value={interest} onChange={setInterest} required={false} /><MoneyField label="Cargos del préstamo" value={charges} onChange={setCharges} required={false} /><p>Capital: {formatCurrency(input.amountMinor-input.interestMinor-input.chargesMinor,currency)}</p></>}
      {card?.type === "payment" && <label className="field"><span>Ahorro utilizado para pagar</span><select value={fundId} onChange={e=>setFundId(e.target.value)}><option value="">Sin utilizar ahorros</option>{Object.values(data.savingsFunds).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
      <label className="field"><span>Motivo o nota</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} /></label>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>void build(true)}>Revertir movimiento</button><button className="button button-primary">Ver efectos antes de guardar</button></div>
    </form>}{error && <p role="alert" className="form-error">{error}</p>}
  </Modal>;
}
