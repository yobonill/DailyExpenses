import { getLoanBalance } from "./loanLedger";
import type { FinancialData, Currency } from "../models/finance";
import type { Expense } from "../models/expense";
import type { AppUserDefinition } from "../config/appUsers";
import { buildExpenseUpdates, buildMovementEdit, collapsePatchVersions, newExpense, type MovementEdit } from "./movementEditing";
import { createFinanceActions } from "../hooks/useFinanceActions";
import { applyFinancialUpdates } from "./financialState";
import { reviewMeta, validatePastDate } from "./financialReview";
import { assertOpenHistoryUpdates, assertHistoryDateOpen } from "./openCycles";
import { getQuincena, toLocalDateKey } from "./date";
import { createId } from "./id";

export type HistoryScope = { kind: "account" | "bank" | "card" | "loan"; id: string; currency?: Currency };
export type HistoryTarget = { source: "moneyTransaction" | "cardTransaction" | "loanTransaction" | "payment" | "expense"; sourceId: string };
export type HistoryInput = MovementEdit & { kind: string; toAccountId: string; direction: "in" | "out"; quantity: number; obligationId: string };
export function resolveHistoryTarget(data: FinancialData, target: HistoryTarget): HistoryTarget {
  if (target.source === "payment" || target.source === "expense") return target;
  const t = target.source === "moneyTransaction" ? data.moneyTransactions[target.sourceId] : target.source === "cardTransaction" ? data.cardTransactions[target.sourceId] : data.loanTransactions[target.sourceId];
  if (!t) throw new Error("Movimiento no disponible.");
  if ("linkedDailyExpenseId" in t && t.linkedDailyExpenseId) return { source: "expense", sourceId: t.linkedDailyExpenseId };
  if (t.linkedPaymentId) return { source: "payment", sourceId: t.linkedPaymentId };
  if ("linkedCardTransactionId" in t && t.linkedCardTransactionId) return resolveHistoryTarget(data, {source:"cardTransaction", sourceId:t.linkedCardTransactionId});
  if ("linkedLoanTransactionId" in t && t.linkedLoanTransactionId) return resolveHistoryTarget(data, {source:"loanTransaction", sourceId:t.linkedLoanTransactionId});
  if ("transferId" in t && t.transferId) {
    const out = Object.values(data.moneyTransactions).find(x => x.transferId === t.transferId && x.type === "transfer" && x.direction === "out" && !x.reversedAt);
    if (out) return {source:"moneyTransaction", sourceId:out.id};
  }
  return target;
}
export function historyInput(data: FinancialData, expenses: Expense[], scope: HistoryScope, target?: HistoryTarget): HistoryInput {
  const base: HistoryInput = {date:toLocalDateKey(), name:"", category:"Otros", amountMinor:0, currency:scope.currency || "DOP", method:"bankTransfer", accountId:scope.kind === "account" ? scope.id : "", cardId:scope.kind === "card" ? scope.id : "", fundId:"", feeMinor:0, settlementMinor:0, interestMinor:0, chargesMinor:0, notes:"", kind:scope.kind === "card" ? "charge" : scope.kind === "loan" ? "loanPayment" : "expense", toAccountId:"", direction:"out", quantity:1, obligationId:""};
  if (base.accountId) { base.currency=data.moneyAccounts[base.accountId].currency; base.method=data.moneyAccounts[base.accountId].kind === "cash" ? "cash" : "bankTransfer"; }
  if (scope.kind === "loan") base.currency=data.loans[scope.id].currency;
  if (!target) return base;
  const r=resolveHistoryTarget(data,target);
  if(r.source === "expense") {
    const e=expenses.find(x=>x.id===r.sourceId); if(!e) throw new Error("Gasto original no disponible.");
    return {...base,kind:"expense",date:e.occurredDate,name:e.name,category:e.category || "Otros",amountMinor:e.unitPriceCents*e.quantity,quantity:e.quantity,currency:e.currency || "DOP",accountId:e.moneyAccountId || "cash",feeMinor:e.transferFeeCents || 0,method:e.paymentMethod === "creditCard" ? "creditCard" : e.paymentMethod === "cash" ? "cash" : e.paymentMethod === "debit" ? "debitCard" : "bankTransfer"};
  }
  if(r.source === "payment") {
    const p=data.payments[r.sourceId]; const o=(p.sourceType === "monthly" ? data.monthlyOccurrences : data.nonMonthlyOccurrences)[p.sourceId];
    const loan=p.loanTransactionId ? data.loanTransactions[p.loanTransactionId] : undefined;
    return {...base,kind:loan?"loanPayment":"payment", date:p.reportingExactDate || p.paidDate, name:o?.name || "Pago",category:o?.category || "Otros", amountMinor:p.amountMinor,currency:p.currency,method:p.reportingMethod || p.method,accountId:p.reportingMoneyAccountId || p.moneyAccountId || "",cardId:p.reportingCardId || p.cardId || "",feeMinor:p.transferFeeMinor || 0,settlementMinor:p.settlementAmountDopMinor || 0,interestMinor:loan?.interestMinor || 0,chargesMinor:loan?.chargesMinor || 0,notes:p.notes || "",fundId:p.savingsTransactionIds?.map(id=>data.savingsTransactions[id]).find(t=>t?.type==="deposit")?.fundId || ""};
  }
  if(r.source === "cardTransaction") {
    const t=data.cardTransactions[r.sourceId];
    return {...base,kind:t.type,date:t.transactionDate,name:t.description,category:t.category || "Otros",amountMinor:t.amountMinor,currency:t.currency,method:t.type === "charge" ? "creditCard" : t.paymentMethod || "bankTransfer",accountId:t.moneyAccountId || "",cardId:t.cardId,feeMinor:t.transferFeeMinor || 0,settlementMinor:t.settlementAmountDopMinor || 0,notes:t.notes || "",fundId:Object.values(data.savingsTransactions).find(x=>x.linkedCardTransactionId===t.id && !x.reversedAt)?.fundId || ""};
  }
  if(r.source === "loanTransaction") {
    const t=data.loanTransactions[r.sourceId];
    return {...base,kind:"adjustment",date:t.transactionDate,name:"Ajuste de préstamo",amountMinor:t.adjustmentMinor || 0,notes:t.notes || "",currency:data.loans[t.loanId].currency};
  }
  const t=data.moneyTransactions[r.sourceId];
  const pair=t.transferId ? Object.values(data.moneyTransactions).filter(x=>x.transferId===t.transferId && !x.reversedAt) : [];
  return {...base,kind:t.type,date:t.transactionDate,name:t.description,amountMinor:t.amountMinor,currency:t.currency,accountId:t.accountId,method:data.moneyAccounts[t.accountId]?.kind === "cash" ? "cash" : "bankTransfer",notes:t.notes || "",direction:t.direction,toAccountId:pair.find(x=>x.direction==="in")?.accountId || "",feeMinor:pair.find(x=>x.type==="fee")?.amountMinor || 0};
}

export async function buildHistoryUpdates(data: FinancialData, expenses: Expense[], user: AppUserDefinition, scope: HistoryScope, input: HistoryInput, target?: HistoryTarget, remove=false): Promise<Record<string,unknown>> {
  validatePastDate(input.date); assertHistoryDateOpen(data,input.date);
  if (target) assertHistoryDateOpen(data, historyInput(data,expenses,scope,target).date);
  if(!remove && (!input.name.trim() || !Number.isSafeInteger(input.amountMinor) || !input.amountMinor || (input.kind!=="adjustment" && input.amountMinor<0))) throw new Error("Completa descripción y monto válido.");
  for(const amount of [input.feeMinor,input.settlementMinor,input.interestMinor,input.chargesMinor]) if(!Number.isSafeInteger(amount)||amount<0) throw new Error("Revisa comisiones, intereses y cargos.");
  let candidate=data; const updates:Record<string,unknown>={};
  const capture=async(patch:Record<string,unknown>)=>{Object.assign(updates,patch); candidate=applyFinancialUpdates(candidate,patch);};
  const actions=()=>createFinanceActions({data:candidate,user,commitUpdates:capture});
  const meta=(old?: Parameters<typeof reviewMeta>[1])=>reviewMeta(user.uid,old);
  const now=new Date().toISOString();
  const r=target ? resolveHistoryTarget(data,target) : undefined;
  const openingDate=scope.kind==="card"?data.creditCards[scope.id]?.openingDate:scope.kind==="loan"?data.loans[scope.id]?.openingDate:undefined;
  if(!target && openingDate && input.date<openingDate) throw new Error("La fecha es anterior al saldo inicial del producto.");
  const account=data.moneyAccounts[input.accountId];
  const requireAccount=()=>{if(!account || !account.active || account.archivedAt || account.currency!==input.currency) throw new Error("Selecciona una cuenta activa en la moneda del movimiento."); if(input.date<account.openingDate) throw new Error("La fecha es anterior al saldo inicial de la cuenta.");};
  if(r?.source === "expense" || (!r && input.kind === "expense")) {
    const old=r?expenses.find(e=>e.id===r.sourceId):undefined;
    if(r&&!old) throw new Error("Gasto original no disponible.");
    if(old) assertHistoryDateOpen(data,old.occurredDate);
    if(!remove && input.method!=="creditCard" && !old?.includedInOpeningBalance) requireAccount();
    if(!Number.isInteger(input.quantity)||input.quantity<1||!Number.isInteger(input.amountMinor/input.quantity)) throw new Error("El total debe dividirse en precios de centavos exactos para la cantidad indicada.");
    const fields={name:input.name,category:input.category,occurredDate:input.date,unitPriceCents:input.amountMinor/input.quantity,quantity:input.quantity,currency:input.currency,paymentMethod:input.method === "creditCard" ? "creditCard" as const : input.method === "cash" ? "cash" as const : input.method === "debitCard" ? "debit" as const : "transfer" as const,moneyAccountId:input.accountId,transferFeeCents:input.feeMinor};
    await capture(await buildExpenseUpdates(data,user,old?{...old,...fields}:newExpense(fields),remove));
  } else if(r?.source === "payment" || r?.source === "cardTransaction") {
    // Reuse the original operation so its bank, debt, savings and obligation links stay together.
    await capture(await buildMovementEdit(data,user,{source:r.source,sourceId:r.sourceId},input,remove));
    if(r.source === "cardTransaction" && !remove) {
      for(const [path,value] of Object.entries(updates)) {
        if(path.startsWith("cardTransactions/") && !(value as {reversedAt?:string}).reversedAt) updates[path]={...(value as object),notes:input.notes};
      }
    }
    if(r.source === "payment" && !remove) {
      const p=data.payments[r.sourceId]; const group=p.sourceType === "monthly" ? "monthlyOccurrences" : "nonMonthlyOccurrences";
      await capture({[`${group}/${p.sourceId}`]:{...candidate[group][p.sourceId],name:input.name,...meta(data[group][p.sourceId])}});
    }
  } else if(r?.source === "loanTransaction") {
    const t=data.loanTransactions[r.sourceId];
    if(t.type!=="adjustment") throw new Error("No se encontró el pago original del préstamo.");
    await capture({[`loanTransactions/${t.id}`]:{...t,adjustmentMinor:input.amountMinor,transactionDate:input.date,notes:input.notes,reversedAt:remove?now:undefined,...meta(t)}});
  } else if(r?.source === "moneyTransaction") {
    const t=data.moneyTransactions[r.sourceId];
    if(t.linkedIncomeOccurrenceId) {
      await actions().reopenIncome(t.linkedIncomeOccurrenceId);
      if(!remove) {
        requireAccount();
        const old=data.incomeOccurrences[t.linkedIncomeOccurrenceId];
        await capture({[`incomeOccurrences/${old.id}`]:{...candidate.incomeOccurrences[old.id],name:input.name,notes:input.notes,...meta(old)}});
        await actions().receiveIncome(old.id,input.amountMinor,input.date,input.accountId);
      }
    } else if(t.transferId) {
      const pair=Object.values(data.moneyTransactions).filter(x=>x.transferId===t.transferId&&!x.reversedAt);
      for(const x of pair) await capture({[`moneyTransactions/${x.id}`]:{...x,reversedAt:now,...meta(x)}});
      if(!remove) {requireAccount(); await actions().transferMoney(input.accountId,input.toAccountId,input.amountMinor,input.date,input.feeMinor,input.notes);}
    } else {
      if(!["fee","adjustment"].includes(t.type)) throw new Error("No se encontró la operación original vinculada.");
      if(!remove) requireAccount();
      await capture({[`moneyTransactions/${t.id}`]:{...t,accountId:input.accountId,amountMinor:Math.abs(input.amountMinor),direction:t.type==="fee"?"out":input.direction,transactionDate:input.date,description:input.name,notes:input.notes,reversedAt:remove?now:undefined,...meta(t)}});
    }
  } else if(scope.kind === "loan" && input.kind === "adjustment") {
    await actions().adjustLoanBalance(scope.id,getLoanBalance(data,scope.id)+input.amountMinor,input.date,input.notes);
  } else if(scope.kind === "card" || input.kind === "cardPayment") {
    await actions().addCardTransaction(input.cardId,input.currency,input.kind === "cardPayment"?"payment":input.kind as "charge"|"payment"|"credit"|"adjustment",input.amountMinor,input.date,input.name,input.fundId || undefined,input.settlementMinor || undefined,true,input.accountId,input.method === "cash"?"cash":"bankTransfer",input.feeMinor,input.category);
  } else if(input.kind === "loanPayment") {
    const loan=data.loans[scope.id]; if(!loan) throw new Error("Selecciona el préstamo.");
    let sourceId=input.obligationId;
    if(!sourceId) {
      await actions().createOneTimeMonthly({name:input.name,category:input.category,estimatedAmountMinor:input.amountMinor,currency:loan.currency,dueDate:input.date,dueRule:{kind:"day",day:15},plannedQuincena:getQuincena(input.date),variableAmount:true,canPayWithCard:false,active:true,loanId:loan.id});
      sourceId=Object.keys(updates).find(p=>p.startsWith("monthlyOccurrences/"))!.split("/")[1];
    }
    const sourceType=sourceId.startsWith("nonMonthly:")?"nonMonthly":"monthly";
    sourceId=sourceId.replace(/^(monthly|nonMonthly):/,"");
    const occurrence=(sourceType==="monthly"?candidate.monthlyOccurrences:candidate.nonMonthlyOccurrences)[sourceId];
    if(!occurrence || occurrence.loanId!==loan.id) throw new Error("Selecciona una obligación de este préstamo.");
    await actions().payObligation({sourceType,sourceId,amountMinor:input.amountMinor,currency:loan.currency,paidDate:input.date,method:input.method,moneyAccountId:input.accountId,transferFeeMinor:input.feeMinor,settlementAmountDopMinor:input.settlementMinor,loanPrincipalMinor:input.amountMinor-input.interestMinor-input.chargesMinor,loanInterestMinor:input.interestMinor,loanChargesMinor:input.chargesMinor,notes:input.notes});
  } else if(input.kind === "income") {
    requireAccount();
    await actions().createOneTimeIncome({name:input.name,expectedAmountMinor:input.amountMinor,currency:input.currency,expectedDate:input.date,notes:input.notes,exportExpectedWhenPending:false});
    const id=Object.keys(updates).find(p=>p.startsWith("incomeOccurrences/"))!.split("/")[1];
    await actions().receiveIncome(id,input.amountMinor,input.date,input.accountId);
  } else if(input.kind === "transfer") {
    requireAccount(); await actions().transferMoney(input.accountId,input.toAccountId,input.amountMinor,input.date,input.feeMinor,input.notes);
  } else if(input.kind === "fee" || input.kind === "adjustment") {
    requireAccount(); const id=createId();
    await capture({[`moneyTransactions/${id}`]:{id,accountId:input.accountId,currency:input.currency,type:input.kind,direction:input.kind==="fee"?"out":input.direction,amountMinor:Math.abs(input.amountMinor),transactionDate:input.date,description:input.name,notes:input.notes,...meta()}});
  } else throw new Error("Tipo de movimiento no válido.");
  // Loan snapshots are recalculated by the shared commit pipeline. Ensure the preview
  // cannot promise an impossible negative principal balance.
  for (const loan of Object.values(candidate.loans)) {
    let balance=loan.openingBalanceMinor;
    for(const t of Object.values(candidate.loanTransactions).filter(t=>t.loanId===loan.id&&!t.reversedAt).sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))) {
      balance+=t.type==="payment"?-(t.principalMinor||0):(t.adjustmentMinor||0);
      if(balance<0) throw new Error("La corrección dejaría el préstamo con capital negativo. Revisa los pagos posteriores.");
    }
  }
  for(const [path,value] of Object.entries(updates)) {
    const row=value as {accountId?:string;cardId?:string;loanId?:string;transactionDate?:string;reversedAt?:string;affectsCurrentBalance?:boolean};
    if(!row || row.reversedAt || row.affectsCurrentBalance===false || !row.transactionDate) continue;
    const opening=path.startsWith("moneyTransactions/")?data.moneyAccounts[row.accountId||""]?.openingDate:path.startsWith("cardTransactions/")?data.creditCards[row.cardId||""]?.openingDate:path.startsWith("loanTransactions/")?data.loans[row.loanId||""]?.openingDate:undefined;
    if(opening && row.transactionDate<opening) throw new Error("Un movimiento vinculado quedaría antes del saldo inicial de su cuenta o producto.");
  }
  const patch=collapsePatchVersions(data,updates); assertOpenHistoryUpdates(data,patch); return patch;
}
