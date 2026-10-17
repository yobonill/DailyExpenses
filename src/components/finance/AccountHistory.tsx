import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { FinancialData, Currency } from "../../models/finance";
import type { Expense } from "../../models/expense";
import type { AppUserDefinition } from "../../config/appUsers";
import { buildHistoryUpdates, historyInput, resolveHistoryTarget, type HistoryScope, type HistoryTarget, type HistoryInput } from "../../lib/accountHistory";
import { isHistoryDateLocked, assertOpenHistoryUpdates } from "../../lib/openCycles";
import { balancesAt } from "../../lib/financialReview";
import { getLoanBalance } from "../../lib/loanLedger";
import { applyFinancialUpdates } from "../../lib/financialState";
import { moneyAccountLabel } from "../../lib/moneyLedger";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import { getBudgetCycleRange, getMonthKey, toLocalDateKey } from "../../lib/date";
import { EXPENSE_CATEGORIES } from "../../config/financeCategories";
import { Modal, MoneyField } from "./Shared";

type HistoryContextValue={data:FinancialData; expenses:Expense[]; user:AppUserDefinition; onCommit:(updates:Record<string,unknown>)=>Promise<void>};
const HistoryContext=createContext<HistoryContextValue|null>(null);
export function AccountHistoryProvider({children,...value}:HistoryContextValue & {children:ReactNode}) {return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;}

interface Row {id:string; createdAt:string; target:HistoryTarget; date:string; name:string; label:string; currency:Currency; delta:number; balance:number; key:string; locked:boolean}
function rowsFor(data:FinancialData,scope:HistoryScope):Row[] {
  const rows:Row[]=[];
  const locked=(date:string)=>isHistoryDateLocked(data,date);
  if(scope.kind==="account"||scope.kind==="bank") {
    for(const a of Object.values(data.moneyAccounts).filter(a=>scope.kind==="account"?a.id===scope.id:a.bankId===scope.id)) {
      let balance=a.openingBalanceMinor;
      Object.values(data.moneyTransactions).filter(t=>t.accountId===a.id&&!t.reversedAt).sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).forEach(t=>{
        const delta=t.direction==="in"?t.amountMinor:-t.amountMinor; balance+=delta;
        rows.push({id:t.id,createdAt:t.createdAt,target:{source:"moneyTransaction",sourceId:t.id},date:t.transactionDate,name:t.description,label:moneyAccountLabel(a.id,data),currency:t.currency,delta,balance,key:a.id,locked:locked(t.transactionDate)});
      });
    }
  } else if(scope.kind==="card") {
    const card=data.creditCards[scope.id];
    for(const currency of ["DOP","USD"] as const) {
      let balance=currency==="DOP"?card.openingCurrentDebtDopMinor:card.openingCurrentDebtUsdMinor;
      Object.values(data.cardTransactions).filter(t=>t.cardId===card.id&&t.currency===currency&&!t.reversedAt).sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).forEach(t=>{
        const delta=t.affectsCurrentBalance===false?0:(t.type==="payment"||t.type==="credit"?-t.amountMinor:t.amountMinor); balance+=delta;
        rows.push({id:t.id,createdAt:t.createdAt,target:{source:"cardTransaction",sourceId:t.id},date:t.transactionDate,name:t.description,label:t.affectsCurrentBalance===false?"Histórico · incluido en saldo inicial":t.type==="payment"?"Pago":t.type==="credit"?"Crédito / devolución":t.type==="charge"?"Cargo":"Ajuste",currency,delta,balance,key:currency,locked:locked(t.transactionDate)});
      });
    }
  } else {
    const loan=data.loans[scope.id]; let balance=loan.openingBalanceMinor;
    Object.values(data.loanTransactions).filter(t=>t.loanId===loan.id&&!t.reversedAt).sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).forEach(t=>{
      const delta=t.type==="payment"?-(t.principalMinor||0):(t.adjustmentMinor||0); balance+=delta;
      rows.push({id:t.id,createdAt:t.createdAt,target:{source:"loanTransaction",sourceId:t.id},date:t.transactionDate,name:t.type==="payment"?"Pago de préstamo":"Ajuste de capital",label:t.type==="payment"?`Total ${formatCurrency(t.totalPaymentMinor||0,loan.currency)} · Interés ${formatCurrency(t.interestMinor||0,loan.currency)} · Cargos ${formatCurrency(t.chargesMinor||0,loan.currency)}`:t.notes||"",currency:loan.currency,delta,balance,key:loan.id,locked:locked(t.transactionDate)});
    });
  }
  return rows;
}

export function AccountHistory({scope,onClose}:{scope:HistoryScope;onClose:()=>void}) {
  const context=useContext(HistoryContext);
  if(!context) return <p role="alert">No se pudo abrir el historial.</p>;
  return <HistoryWorkspace {...context} scope={scope} onClose={onClose}/>;
}
function HistoryWorkspace({data,expenses,user,onCommit,scope,onClose}:HistoryContextValue & {scope:HistoryScope;onClose:()=>void}) {
  const initial=getBudgetCycleRange(getMonthKey(toLocalDateKey()));
  const [start,setStart]=useState(initial.startDateKey), [end,setEnd]=useState(toLocalDateKey());
  const [currency,setCurrency]=useState<Currency|"">(scope.currency||"");
  const [account,setAccount]=useState(""); const [reported,setReported]=useState("");
  const [editing,setEditing]=useState<{target?:HistoryTarget;remove:boolean;input:HistoryInput}|null>(null);
  const [error,setError]=useState("");
  const scroll=useRef(0); const list=useRef<HTMLDivElement>(null);
  const rows=useMemo(()=>rowsFor(data,scope),[data,scope.kind,scope.id]);
  const visible=rows.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end)&&(!currency||r.currency===currency)&&(!account||r.key===account)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  const name=scope.kind==="bank"?data.banks[scope.id]?.name:scope.kind==="account"?moneyAccountLabel(scope.id,data):scope.kind==="card"?data.creditCards[scope.id]?.name:data.loans[scope.id]?.name;
  const accounts=scope.kind==="bank"?Object.values(data.moneyAccounts).filter(a=>a.bankId===scope.id):[];
  const summaries=useMemo(()=>{
    const keys=scope.kind==="bank"?accounts.filter(a=>!account||a.id===account).map(a=>({key:a.id,currency:a.currency,name:moneyAccountLabel(a.id,data),opening:a.openingBalanceMinor,openingDate:a.openingDate})):
      scope.kind==="account"?[{key:scope.id,currency:data.moneyAccounts[scope.id].currency,name:name||"",opening:data.moneyAccounts[scope.id].openingBalanceMinor,openingDate:data.moneyAccounts[scope.id].openingDate}]:
      scope.kind==="card"?(["DOP","USD"] as const).map(c=>({key:c,currency:c,name:`Deuda ${c}`,opening:c==="DOP"?data.creditCards[scope.id].openingCurrentDebtDopMinor:data.creditCards[scope.id].openingCurrentDebtUsdMinor,openingDate:data.creditCards[scope.id].openingDate})):
      [{key:scope.id,currency:data.loans[scope.id].currency,name:"Capital pendiente",opening:data.loans[scope.id].openingBalanceMinor,openingDate:data.loans[scope.id].openingDate}];
    return keys.filter(k=>!currency||k.currency===currency).map(k=>({...k,before:k.opening+rows.filter(r=>r.key===k.key&&start&&r.date<start).reduce((s,r)=>s+r.delta,0),after:k.opening+rows.filter(r=>r.key===k.key&&(!end||r.date<=end)).reduce((s,r)=>s+r.delta,0)}));
  },[data,scope.kind,scope.id,start,end,currency,account,rows]);
  const open=(target?:HistoryTarget,remove=false)=>{
    setError(""); try {const input=historyInput(data,expenses,scope,target); if(!target&&account) {input.accountId=account;input.currency=data.moneyAccounts[account].currency;} if(target&&isHistoryDateLocked(data,input.date)) throw new Error("Este movimiento pertenece a un ciclo cerrado."); scroll.current=list.current?.scrollTop||0; setEditing({target,remove,input});} catch(e){setError(e instanceof Error?e.message:"No se pudo abrir.");}
  };
  const back=()=>{setEditing(null);requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=scroll.current;});};
  if(editing) return <HistoryForm {...{data,expenses,user,onCommit,scope}} initial={editing.input} target={editing.target} remove={editing.remove} onClose={back}/>;
  const report=parseHistoryMoney(reported);
  return <Modal title={`Historial · ${name}`} onClose={onClose} wide>
    <div className="history-workspace-filters">
      <label className="field"><span>Desde</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label className="field"><span>Hasta</span><input type="date" max={toLocalDateKey()} value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label className="field"><span>Moneda</span><select value={currency} onChange={e=>{setCurrency(e.target.value as Currency|"");setReported("");}}><option value="">Todas</option><option>DOP</option><option>USD</option></select></label>
      {scope.kind==="bank"&&<label className="field"><span>Cuenta</span><select value={account} onChange={e=>{setAccount(e.target.value);setReported("");}}><option value="">Todas las cuentas</option>{accounts.map(a=><option key={a.id} value={a.id}>{moneyAccountLabel(a.id,data)}</option>)}</select></label>}
    </div>
    {start&&end&&start>end?<p role="alert">La fecha inicial debe ser anterior a la final.</p>:<>
    <div className="history-balance-summaries">{summaries.map(s=><div className="form-summary" key={s.key}><strong>{s.name}</strong>{start&&start<s.openingDate?<span>El rango comienza antes del saldo inicial ({s.openingDate}); el historial anterior puede estar incompleto.</span>:null}<span>Inicial: {formatCurrency(s.before,s.currency)}</span><strong>Final: {formatCurrency(s.after,s.currency)}</strong></div>)}</div>
    {summaries.length===1&&<div className="history-statement-compare"><MoneyField label="Saldo final según el banco (opcional)" value={reported} onChange={setReported} currency={summaries[0].currency} required={false}/>{report!==null&&reported!==""&&<strong>Diferencia (banco − aplicación): {formatCurrency(report-summaries[0].after,summaries[0].currency)}</strong>}</div>}
    </>}
    <div className="row-actions"><button className="button button-primary" onClick={()=>open()}>＋ Agregar movimiento</button><button className="button button-secondary" onClick={()=>{setStart("");setEnd(toLocalDateKey());}}>Todo el historial</button></div>
    <p className="privacy-note">Los ciclos cerrados son de solo lectura. Eliminar anula la operación y sus efectos vinculados; se conserva la auditoría.</p>
    <div className="history-workspace-list" ref={list}>{visible.map(r=><article className="history-movement" key={r.id}><div><strong>{r.name}</strong><small>{r.date} · {r.label}</small><small>{scope.kind==="card"?"Deuda":scope.kind==="loan"?"Capital":"Saldo"} después: {formatCurrency(r.balance,r.currency)}</small></div><div><strong>{r.delta>0?"+":""}{formatCurrency(r.delta,r.currency)}</strong><div className="inline-actions">{r.locked?<small>Ciclo cerrado</small>:<><button onClick={()=>open(r.target)}>Editar</button><button className="danger-text" onClick={()=>open(r.target,true)}>Eliminar</button></>}</div></div></article>)}{!visible.length&&<p className="muted-panel">Sin movimientos en este rango.</p>}</div>
    {error&&<p role="alert" className="form-error">{error}</p>}
  </Modal>;
}

function HistoryForm({data,expenses,user,onCommit,scope,initial,target,remove,onClose}:HistoryContextValue & {scope:HistoryScope;initial:HistoryInput;target?:HistoryTarget;remove:boolean;onClose:()=>void}) {
  const [input,setInput]=useState(initial); const [preview,setPreview]=useState<Record<string,unknown>|null>(null); const [base,setBase]=useState(data);
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const set=<K extends keyof HistoryInput>(key:K,value:HistoryInput[K])=>{setInput(x=>({...x,[key]:value}));};
  const resolved=target?resolveHistoryTarget(data,target):undefined;
  const isCard=resolved?.source==="cardTransaction"||(!target&&scope.kind==="card");
  const isLoanAdjustment=resolved?.source==="loanTransaction"||(!target&&scope.kind==="loan"&&input.kind==="adjustment");
  const needsAccount=!isLoanAdjustment&&!(isCard&&input.kind!=="payment")&&input.method!=="creditCard";
  const accounts=Object.values(data.moneyAccounts).filter(a=>!a.archivedAt&&(a.active||a.id===input.accountId));
  const historical=resolved?.source==="expense"?expenses.find(e=>e.id===resolved.sourceId)?.includedInOpeningBalance:resolved?.source==="payment"?data.payments[resolved.sourceId]?.historical:resolved?.source==="cardTransaction"?data.cardTransactions[resolved.sourceId]?.affectsCurrentBalance===false:false;
  const build=async()=>{setError("");setBusy(true);try{const patch=await buildHistoryUpdates(data,expenses,user,scope,input,target,remove);setPreview(patch);setBase(data);}catch(e){setError(e instanceof Error?e.message:"No se pudo preparar.");}finally{setBusy(false);}};
  const save=async()=>{if(!preview)return;setError(""); if(base!==data){setPreview(null);setError("Los datos cambiaron. Revisa nuevamente la vista previa.");return;}setBusy(true);try{assertOpenHistoryUpdates(data,preview);await onCommit(preview);onClose();}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}finally{setBusy(false);}};
  const after=preview?applyFinancialUpdates(data,preview):data;
  const changes=balancesAt(data,toLocalDateKey()).flatMap(b=>{const a=balancesAt(after,toLocalDateKey()).find(x=>x.key===b.key);return a&&(a.calculatedMinor!==b.calculatedMinor||a.reservedMinor!==b.reservedMinor)?[`${b.name}: ${formatCurrency(b.calculatedMinor,b.currency)} → ${formatCurrency(a.calculatedMinor,b.currency)} (apartado: ${formatCurrency(b.reservedMinor,b.currency)} → ${formatCurrency(a.reservedMinor,b.currency)})`]:[];});
  for(const loan of Object.values(data.loans)){const before=getLoanBalance(data,loan.id),next=getLoanBalance(after,loan.id);if(before!==next)changes.push(`${loan.name} · capital: ${formatCurrency(before,loan.currency)} → ${formatCurrency(next,loan.currency)}`);}
  const money=(key:"amountMinor"|"feeMinor"|"settlementMinor"|"interestMinor"|"chargesMinor",label:string,currency=input.currency)=><HistoryMoney key={key} label={label} value={input[key]} currency={currency} onChange={v=>set(key,v)}/>;
  return <Modal title={remove?"Eliminar movimiento":target?"Editar movimiento":"Agregar movimiento"} onClose={()=>{if(!busy)onClose();}} wide confirmClose>
    {preview?<><p><strong>{input.name}</strong> · {remove?"Se anulará la operación completa y sus movimientos vinculados.":"Revisa los efectos antes de guardar."}</p>{changes.length?<ul>{changes.map(s=><li key={s}>{s}</li>)}</ul>:<p>Sin cambio en los balances actuales.</p>}<p>Se conservará la versión anterior en la auditoría.</p><div className="modal-actions"><button disabled={busy} onClick={()=>setPreview(null)}>Volver</button><button className="button button-primary" disabled={busy} onClick={()=>void save()}>{busy?"Guardando…":remove?"Confirmar eliminación":"Confirmar cambios"}</button></div></>:
    remove?<><p>¿Eliminar <strong>{input.name}</strong> del {input.date}, por {formatCurrency(input.amountMinor,input.currency)}?</p><p>Se revertirán también sus efectos en cuentas, tarjetas, préstamos y pagos vinculados.</p><button className="button button-primary" disabled={busy} onClick={()=>void build()}>Ver efectos</button></>:
    <form className="form-grid" onSubmit={e=>{e.preventDefault();void build();}}>
      {!target&&<label className="field"><span>Tipo de movimiento</span><select value={input.kind} onChange={e=>set("kind",e.target.value)}>{(scope.kind==="card"?[["charge","Cargo / compra"],["payment","Pago de tarjeta"],["credit","Devolución / cashback"],["adjustment","Ajuste de deuda (diferencia)"]]:scope.kind==="loan"?[["loanPayment","Pago de préstamo"],["adjustment","Ajuste de capital (diferencia)"]]:[["expense","Gasto"],["income","Ingreso"],["transfer","Transferencia entre cuentas"],["cardPayment","Pago de tarjeta"],["fee","Comisión / impuesto bancario"],["adjustment","Ajuste de saldo (diferencia)"]]).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>}
      {historical&&<p className="form-warning">Movimiento ya incluido en el saldo inicial: la corrección conservará ese tratamiento para evitar contabilizarlo dos veces.</p>}
      <label className="field"><span>Fecha real</span><input type="date" required max={toLocalDateKey()} value={input.date} onChange={e=>set("date",e.target.value)}/></label>
      <label className="field"><span>Descripción</span><input required value={input.name} onChange={e=>set("name",e.target.value)}/></label>
      {isCard&&<label className="field"><span>Moneda</span><select value={input.currency} onChange={e=>set("currency",e.target.value as Currency)}><option>DOP</option><option>USD</option></select></label>}
      {money("amountMinor",input.kind==="adjustment"?isCard||isLoanAdjustment?"Diferencia (+ aumenta deuda, − reduce)":"Diferencia de saldo":"Monto total")}
      {input.kind==="expense"&&<label className="field"><span>Cantidad</span><input type="number" min="1" step="1" value={input.quantity} onChange={e=>set("quantity",Number(e.target.value))}/></label>}
      <label className="field"><span>Categoría</span><select value={input.category} onChange={e=>set("category",e.target.value)}>{[...new Set([...EXPENSE_CATEGORIES,input.category])].map(c=><option key={c}>{c}</option>)}</select></label>
      {(resolved?.source==="payment"||input.kind==="expense")&&<label className="field"><span>Forma de pago</span><select value={input.method} onChange={e=>{const method=e.target.value as HistoryInput["method"];setInput(x=>({...x,method,accountId:method==="cash"?"cash":x.accountId}));}}><option value="cash">Efectivo</option><option value="debitCard">Débito</option><option value="bankTransfer">Transferencia</option>{input.kind!=="loanPayment"&&<option value="creditCard">Tarjeta de crédito</option>}</select></label>}
      {input.method==="creditCard"&&resolved?.source==="payment"&&<label className="field"><span>Tarjeta</span><select required value={input.cardId} onChange={e=>set("cardId",e.target.value)}><option value="">Seleccionar tarjeta</option>{Object.values(data.creditCards).filter(c=>!c.archivedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      {needsAccount&&<label className="field"><span>{input.kind==="transfer"?"Cuenta de origen":"Cuenta utilizada"}</span><select required value={input.accountId} onChange={e=>{const a=data.moneyAccounts[e.target.value];setInput(x=>({...x,accountId:e.target.value,method:a?.kind==="cash"?"cash":"bankTransfer",currency:!target&&scope.kind!=="card"&&scope.kind!=="loan"&&x.kind!=="cardPayment"?a?.currency||x.currency:x.currency}));}}><option value="">Seleccionar cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{moneyAccountLabel(a.id,data)} · {a.currency}</option>)}</select></label>}
      {input.kind==="transfer"&&<label className="field"><span>Cuenta de destino</span><select required value={input.toAccountId} onChange={e=>set("toAccountId",e.target.value)}><option value="">Seleccionar cuenta</option>{accounts.filter(a=>a.id!==input.accountId&&a.currency===input.currency).map(a=><option key={a.id} value={a.id}>{moneyAccountLabel(a.id,data)}</option>)}</select></label>}
      {input.kind==="adjustment"&&!isCard&&!isLoanAdjustment&&<label className="field"><span>Efecto</span><select value={input.direction} onChange={e=>set("direction",e.target.value as "in"|"out")}><option value="in">Aumentar saldo</option><option value="out">Reducir saldo</option></select></label>}
      {input.kind==="cardPayment"&&<><label className="field"><span>Tarjeta</span><select required value={input.cardId} onChange={e=>set("cardId",e.target.value)}><option value="">Seleccionar tarjeta</option>{Object.values(data.creditCards).filter(c=>!c.archivedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Moneda de la deuda</span><select value={input.currency} onChange={e=>set("currency",e.target.value as Currency)}><option>DOP</option><option>USD</option></select></label></>}
      {needsAccount&&!["income","fee","adjustment"].includes(input.kind)&&money("feeMinor","Comisión de transferencia", ["payment","cardPayment","loanPayment"].includes(input.kind)?"DOP":input.currency)}
      {needsAccount&&input.currency==="USD"&&["payment","cardPayment","loanPayment"].includes(input.kind)&&money("settlementMinor","Monto realmente retirado en DOP","DOP")}
      {input.kind==="loanPayment"&&<>{!target&&<label className="field"><span>Obligación que estás pagando</span><select value={input.obligationId} onChange={e=>set("obligationId",e.target.value)}><option value="">Pago adicional (crear obligación única)</option>{(["monthly","nonMonthly"] as const).flatMap(type=>Object.values(type==="monthly"?data.monthlyOccurrences:data.nonMonthlyOccurrences).filter(o=>o.loanId===scope.id&&o.status!=="paid"&&o.status!=="cancelled").map(o=><option key={`${type}:${o.id}`} value={`${type}:${o.id}`}>{o.name} · {o.dueDate}</option>))}</select></label>}{money("interestMinor","Intereses")}{money("chargesMinor","Cargos del préstamo")}<p>Capital: {formatCurrency(input.amountMinor-input.interestMinor-input.chargesMinor,input.currency)}</p></>}
      {input.fundId&&<p className="privacy-note">Fondo vinculado: {data.savingsFunds[input.fundId]?.name}. Se conservará su vínculo.</p>}
      <label className="field"><span>Motivo / notas</span><textarea value={input.notes} onChange={e=>set("notes",e.target.value)}/></label>
      <button className="button button-primary" disabled={busy}>{busy?"Preparando…":"Ver efectos antes de guardar"}</button>
    </form>}{error&&<p role="alert" className="form-error">{error}</p>}
  </Modal>;
}
function HistoryMoney({value,onChange,label,currency}:{value:number;onChange:(v:number)=>void;label:string;currency:Currency}) {
  const [text,setText]=useState(value?minorToInput(value):"");
  return <MoneyField label={label} currency={currency} required={false} value={text} onChange={s=>{setText(s);onChange(s.trim()===""?0:parseHistoryMoney(s)??NaN);}}/>;
}

function parseHistoryMoney(value:string):number|null {
  const text=value.trim(); if(!text)return null;
  if (/^[+-]?0+([.,]0{1,2})?$/.test(text)) return 0;
  const negative=text.startsWith("-"); const amount=parseMoneyToCents(text.replace(/^[+-]/,""));
  return amount===null?null:negative?-amount:amount;
}
