import { useState } from "react";
import type { FinancialData } from "../models/finance";
import { balancesAt, buildClosing, closingNeedsReview, reviewMeta } from "../lib/financialReview";
import { formatMonthTitle, getMonthKey, getQuincena, getQuincenaRange, toLocalDateKey } from "../lib/date";
import { formatCurrency, parseMoneyToCents } from "../lib/money";
import { createId } from "../lib/id";
import { MoneyField } from "./finance/Shared";
import { getLoanBalance } from "../lib/loanLedger";

const statusNames = { reconciled: "Cerrada y conciliada", differences: "Cerrada con diferencias", incomplete: "Cerrada incompleta" };
export function CycleReviewView({data, actor, synced, onCommit}: {data: FinancialData; actor: string; synced: boolean; onCommit:(patch:Record<string,unknown>)=>Promise<void>}) {
  const today = toLocalDateKey();
  const [month,setMonth] = useState(getMonthKey(today));
  const [quincena,setQuincena] = useState<1|2>(getQuincena(today));
  const [reports,setReports] = useState<Record<string,string>>({});
  const [notes,setNotes] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [adjusting,setAdjusting] = useState<string|null>(null);
  const cutoff = getQuincenaRange(month,quincena).endDateKey;
  const balances = balancesAt(data,cutoff);
  const closings = Object.values(data.cycleClosings).filter(c=>c.financialMonth===month && c.quincena===quincena).sort((a,b)=>b.revision-a.revision);
  const changePeriod = (m:string,q:1|2) => {setMonth(m);setQuincena(q);setReports({});setError("");};
  const save = async () => {
    setError("");setBusy(true);
    try {
      if (!synced) throw new Error("Espera a que ambos conjuntos de datos estén sincronizados antes de cerrar.");
      const values: Record<string,number|undefined> = {};
      for (const b of balances) {
        const text = reports[b.key]?.trim();
        const parsed = text ? parseMoneyToCents(text.replace(/^-/,"")) : undefined;
        if (text && parsed == null) throw new Error(`Saldo inválido en ${b.name}.`);
        values[b.key] = parsed == null ? undefined : text?.startsWith("-") ? -parsed : parsed;
      }
      const c = buildClosing(data,month,quincena,values,notes,actor);
      if (!window.confirm(`Cerrar ${formatMonthTitle(month)} · Quincena ${quincena}, al ${cutoff}.\n${statusNames[c.status]}.\nLos balances reportados no modificarán el dinero automáticamente. ¿Confirmar?`)) return;
      await onCommit({[`cycleClosings/${c.id}`]:c});
    } catch(e) {setError(e instanceof Error?e.message:"No se pudo cerrar.");} finally {setBusy(false);}
  };
  const adjust = async (key:string) => {
    const b = balances.find(x=>x.key===key);
    if (!b) return;
    setError("");
    try {
      if (b.unavailable) throw new Error("No se puede ajustar una fecha anterior al saldo inicial. Confirma primero el punto de partida.");
      if (!notes.trim()) throw new Error("Escribe un motivo obligatorio antes de crear un ajuste.");
      const raw=reports[key]?.trim();
      const parsed=raw?parseMoneyToCents(raw.replace(/^-/,"")):null;
      if (parsed===null) throw new Error("Indica el saldo real reportado.");
      const actual=raw?.startsWith("-")?-parsed:parsed;
      const delta=actual-b.calculatedMinor;
      if (!delta) throw new Error("El saldo ya coincide.");
      if (b.kind==="account" && actual<b.reservedMinor) throw new Error("Primero revisa los ahorros: el saldo real es menor que el dinero apartado.");
      if (!window.confirm(`${b.name}: calculado ${formatCurrency(b.calculatedMinor,b.currency)} → reportado ${formatCurrency(actual,b.currency)}.\nSe registrará ${formatCurrency(delta,b.currency)} como ajuste al ${cutoff}; también afectará los balances posteriores. No contará como ingreso ni gasto. ¿Confirmar?`)) return;
      const id=createId();
      const base={id, currency:b.currency, transactionDate:cutoff,description:`Ajuste de conciliación · ${notes.trim()}`,notes:notes.trim(),...reviewMeta(actor)};
      await onCommit(b.kind==="account" ? { [`moneyTransactions/${id}`]: {...base,accountId:b.id,type:"adjustment",direction:delta>0?"in":"out",amountMinor:Math.abs(delta)} }
        : { [`cardTransactions/${id}`]: {...base,cardId:b.id,type:"adjustment",amountMinor:delta} });
      setAdjusting(null);
    } catch(e) {setError(e instanceof Error?e.message:"No se pudo ajustar.");}
  };
  return <section className="finance-page"><div className="finance-heading"><div><span className="eyebrow">Verificación de balances</span><h1>Revisar y cerrar quincena</h1></div></div>
    <div className="review-filter"><label className="field"><span>Mes financiero</span><input type="month" required value={month} onChange={e=>{if(e.target.value)changePeriod(e.target.value,quincena);}} /></label><label className="field"><span>Quincena</span><select value={quincena} onChange={e=>changePeriod(month,Number(e.target.value) as 1|2)}><option value={1}>Quincena 1</option><option value={2}>Quincena 2</option></select></label></div>
    <p className="form-warning">Reporta los balances al finalizar el {cutoff}, no los de hoy si estás cerrando tarde. En banco: saldo total que incluye tus ahorros. En tarjeta: deuda actual; comprueba por separado cargos pendientes de contabilizar para comparar la misma base.</p>
    <p>Los saldos bancarios al cierre se conservan para la siguiente quincena. El resumen de ingresos y gastos del ciclo es distinto del dinero acumulado en tus cuentas.</p>
    <div className="balance-review-card"><strong>Cierres de {formatMonthTitle(month)}</strong>{([1,2] as const).map(q=>{const c=Object.values(data.cycleClosings).filter(x=>x.financialMonth===month&&x.quincena===q).sort((a,b)=>b.revision-a.revision)[0];return <p key={q}>Quincena {q}: {c?(closingNeedsReview(data,c)?"Requiere revisión":statusNames[c.status]):"Sin cerrar"}</p>;})}</div>
    {cutoff>today && <p className="form-warning">Esta quincena aún no termina. Podrás cerrarla desde su último día.</p>}
    {balances.map(b=>{const parsed=reports[b.key]?.trim()?parseMoneyToCents(reports[b.key].replace(/^-/,"")):null;const value=parsed===null?null:reports[b.key]?.startsWith("-")?-parsed:parsed;return <article className="balance-review-card" key={b.key}>
      <h3>{b.name} · {b.currency}</h3><p>Calculado: <strong>{b.unavailable ? "No reconstruible antes del saldo inicial" : formatCurrency(b.calculatedMinor,b.currency)}</strong></p>
      {b.kind==="account" && <p>Apartado: {formatCurrency(b.reservedMinor,b.currency)} · Disponible sin apartar: {formatCurrency(b.calculatedMinor-b.reservedMinor,b.currency)}</p>}
      <MoneyField label="Saldo real al cierre (vacío = no pude confirmarlo)" value={reports[b.key]||""} onChange={v=>setReports({...reports,[b.key]:v})} currency={b.currency} required={false} />
      {value!==null && !b.unavailable && <p className={value===b.calculatedMinor?"remaining-value is-positive":"form-error"}>Diferencia: {formatCurrency(value-b.calculatedMinor,b.currency)}</p>}
      <button type="button" className="text-button" onClick={()=>setAdjusting(adjusting===b.key?null:b.key)}>Revisar diferencias y movimientos</button>
      {adjusting===b.key && <div><p>Comprueba ingresos omitidos, gastos duplicados, forma de pago, transferencias, comisiones y dinero apartado. Corrige el movimiento original desde su sección antes de usar un ajuste.</p>
        <ul>{(b.kind==="account" ? Object.values(data.moneyTransactions).filter(t=>t.accountId===b.id && !t.reversedAt && t.transactionDate<=cutoff) : Object.values(data.cardTransactions).filter(t=>t.cardId===b.id && t.currency===b.currency && !t.reversedAt && t.transactionDate<=cutoff)).sort((a,c)=>c.transactionDate.localeCompare(a.transactionDate)).map(t=><li key={t.id}>{t.transactionDate} · {t.description} · {formatCurrency(t.amountMinor,t.currency)}</li>)}</ul>
        <button className="button button-secondary" type="button" disabled={cutoff>today || !synced} onClick={()=>void adjust(b.key)}>Crear ajuste explicado</button></div>}
    </article>;})}
    <label className="field"><span>Notas del cierre / motivo del ajuste</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} /></label>
    {Object.values(data.loans).filter(l=>!l.archivedAt).map(l=><p key={l.id}>{l.name} · Deuda calculada: {formatCurrency(getLoanBalance(data,l.id,cutoff),l.currency)} (confirmación opcional desde Préstamos).</p>)}
    {error && <p role="alert" className="form-error">{error}</p>}<button className="button button-primary" disabled={busy || cutoff>today || !synced} onClick={()=>void save()}>Confirmar cierre de quincena</button>
    <h2>Cierres guardados</h2>{closings.map(c=><details className="balance-review-card" key={c.id}><summary>Revisión {c.revision} · {closingNeedsReview(data,c)?"Requiere revisión":statusNames[c.status]} · {new Date(c.createdAt).toLocaleString("es-DO")}</summary><p>{c.notes}</p>{c.balances.map(b=><p key={b.key}>{b.name}: calculado {formatCurrency(b.calculatedMinor,b.currency)} · reportado {b.reportedMinor===undefined?"Sin confirmar":formatCurrency(b.reportedMinor,b.currency)}</p>)}</details>)}
    <details className="balance-review-card"><summary>Registro de cambios y correcciones</summary>{Object.values(data.changeAudits).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(a=><details key={a.id}><summary>{new Date(a.createdAt).toLocaleString("es-DO")} · {a.description}</summary>{Object.entries(a.after).filter(([path])=>/^(payments|moneyTransactions|cardTransactions|savingsTransactions|loanTransactions|managedExpenses)\//.test(path)).map(([path,value])=>{
      const after=value as {description?:string;name?:string;amountMinor?:number;unitPriceCents?:number;quantity?:number;currency?:"DOP"|"USD";reversedAt?:string;notes?:string;deletedAt?:string};
      const before=a.before[path] as typeof after|undefined;
      return <p key={path}>{after.description||after.name||"Movimiento"}: {before?formatCurrency(before.amountMinor||(before.unitPriceCents||0)*(before.quantity||1),before.currency||"DOP"):"Nuevo"} → {after.reversedAt||after.deletedAt?"Revertido":formatCurrency(after.amountMinor||(after.unitPriceCents||0)*(after.quantity||1),after.currency||"DOP")}{after.notes&&` · ${after.notes}`}</p>;
    })}</details>)}</details>
  </section>;
}

export function BalanceIssuePanel({data,actor,onCommit}: {data:FinancialData;actor:string;onCommit:(patch:Record<string,unknown>)=>Promise<void>}) {
  const [error,setError]=useState("");
  const issues=Object.values(data.balanceIssues).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if (!issues.length) return null;
  const resolve=async(id:string)=>{const i=data.balanceIssues[id];const resolution=window.prompt("Explica qué corregiste o por qué das esta incidencia por revisada. Un ingreso posterior no explica por sí solo el saldo anterior.");if(!resolution?.trim())return;try{await onCommit({[`balanceIssues/${id}`]:{...i,status:"reviewed",resolution:resolution.trim(),...reviewMeta(actor,i)}});}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}};
  return <details className="balance-review-card"><summary>Incidencias: {issues.filter(i=>i.status==="pending").length} pendientes</summary>{issues.map(i=><article key={i.id}><strong>{i.description}</strong><p>{i.date} · Diferencia {formatCurrency(i.differenceMinor,i.currency)} · {i.status==="pending"?"Pendiente de revisar":"Revisada"}</p>{i.accountId && <p>{data.moneyAccounts[i.accountId]?.name}</p>}{i.resolution && <p>{i.resolution}</p>}{i.status==="pending" && <button className="text-button" onClick={()=>void resolve(i.id)}>Resolver con explicación</button>}</article>)}{error&&<p className="form-error">{error}</p>}</details>;
}
