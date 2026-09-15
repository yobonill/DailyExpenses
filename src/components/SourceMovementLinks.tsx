import type { FinancialData } from "../models/finance";
import type { MovementTarget } from "../lib/movementEditing";
import { formatCurrency } from "../lib/money";

export function SourceMovementLinks({data,section,onOpen}: {data:FinancialData;section:string;onOpen:(t:MovementTarget)=>void}) {
  const entries: Array<{target:MovementTarget;name:string;date:string;amount:number;currency:"DOP"|"USD"}> = [];
  if (["budget","future","loans","goals"].includes(section)) for (const p of Object.values(data.payments).filter(p=>!p.reversedAt)) {
    const o=(p.sourceType==="monthly"?data.monthlyOccurrences:data.nonMonthlyOccurrences)[p.sourceId];
    const match=section==="budget"?p.sourceType==="monthly":section==="future"?p.sourceType==="nonMonthly":section==="loans"?Boolean(p.loanId || o?.loanId):Boolean(o && "sourcePurchaseGoalId" in o && o.sourcePurchaseGoalId);
    if(match) entries.push({target:{source:"payment",sourceId:p.id},name:o?.name||"Pago",date:p.reportingExactDate||p.paidDate,amount:p.amountMinor,currency:p.currency});
  }
  if(section==="cards") for(const t of Object.values(data.cardTransactions).filter(t=>!t.reversedAt && !t.linkedDailyExpenseId)) entries.push({target:t.linkedPaymentId?{source:"payment",sourceId:t.linkedPaymentId}:{source:"cardTransaction",sourceId:t.id},name:t.description,date:t.transactionDate,amount:t.amountMinor,currency:t.currency});
  if(section==="savings") for(const t of Object.values(data.savingsTransactions).filter(t=>!t.reversedAt && !t.transferId && t.notes!=="Saldo inicial")) entries.push({target:t.linkedPaymentId?{source:"payment",sourceId:t.linkedPaymentId}:{source:"savingsTransaction",sourceId:t.id},name:data.savingsFunds[t.fundId]?.name||"Ahorro",date:t.transactionDate,amount:t.amountMinor,currency:t.currency});
  if(section==="goals") for(const t of Object.values(data.cardTransactions).filter(t=>!t.reversedAt && t.linkedPurchaseGoalId)) entries.push({target:{source:"cardTransaction",sourceId:t.id},name:t.description,date:t.transactionDate,amount:t.amountMinor,currency:t.currency});
  if(!entries.length) return null;
  return <details className="balance-review-card"><summary>Corregir pagos y movimientos registrados ({entries.length})</summary>{entries.sort((a,b)=>b.date.localeCompare(a.date)).map((e,i)=><div className="source-movement-row" key={`${e.target.source}:${e.target.sourceId}:${i}`}><span>{e.date} · {e.name} · {formatCurrency(e.amount,e.currency)}</span><button className="text-button" onClick={()=>onOpen(e.target)}>Ver y corregir</button></div>)}</details>;
}
