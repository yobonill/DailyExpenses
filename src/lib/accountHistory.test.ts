import { describe,it,expect } from "vitest";
import { createEmptyFinancialData,applyFinancialUpdates } from "./financialState";
import { reviewMeta,buildClosing } from "./financialReview";
import { buildHistoryUpdates,historyInput,resolveHistoryTarget,type HistoryScope } from "./accountHistory";
import { prepareReviewedUpdates } from "./reviewedUpdates";
import { isFinanciallyConsistent,reconcileVersionedUpdates } from "./financialIntegrity";
import { getMoneyAccountBalance } from "./moneyLedger";
import { getLoanBalance } from "./loanLedger";
import { getCardCurrentDebt } from "./financialCalculations";
import { buildSpendingHistory } from "./spendingHistory";
import { assertOpenHistoryUpdates } from "./openCycles";
import { createFinanceActions } from "../hooks/useFinanceActions";
import type { AppUserDefinition } from "../config/appUsers";
import type { FinancialData } from "../models/finance";
const user={uid:"tester"} as AppUserDefinition, meta=reviewMeta("tester");
const scope:HistoryScope={kind:"account",id:"a"};
function fixture(){const d=createEmptyFinancialData();d.banks.b={id:"b",name:"Banco",active:true,...meta};for(const id of ["a","b"])d.moneyAccounts[id]={id,kind:"bank",bankId:"b",accountType:"checking",name:id,currency:"DOP",openingBalanceMinor:1000000,openingDate:"2026-08-15",active:true,...meta};d.creditCards.c={id:"c",name:"Tarjeta",bank:"Banco",currency:"DOP",active:true,openingDate:"2026-08-15",openingCurrentDebtDopMinor:100000,openingCurrentDebtUsdMinor:10000,limitDopMinor:500000,limitUsdMinor:50000,cutDay:10,dueDay:25,...meta} as FinancialData["creditCards"][string];d.loans.l={id:"l",name:"Préstamo",currency:"DOP",openingBalanceMinor:100000,openingDate:"2026-08-15",annualInterestRate:10,active:true,...meta};return d;}
const input=(d:FinancialData,s=scope)=>({...historyInput(d,[],s),date:"2026-09-20",name:"Movimiento",amountMinor:10000,category:"Otros",accountId:"a"});
function commit(d:FinancialData,p:Record<string,unknown>){const next=applyFinancialUpdates(d,prepareReviewedUpdates(d,p,user.uid,{warn:()=>{},confirm:()=>true}));expect(isFinanciallyConsistent(next)).toBe(true);return next;}
describe("account history corrections",()=>{
 it.each(["payment","loan","expense","card","transfer"] as const)("edits/deletes only the commission of a %s",async(kind)=>{
  let d=fixture();
  if(kind==="payment") {
   const actions=()=>createFinanceActions({data:d,user,commitUpdates:async p=>{d=commit(d,p);}});
   await actions().createOneTimeMonthly({name:"Diezmar",category:"Otros",estimatedAmountMinor:10000,currency:"DOP",dueDate:"2026-09-20",dueRule:{kind:"day",day:20},plannedQuincena:1,variableAmount:true,canPayWithCard:false,active:true});
   await actions().payObligation({sourceType:"monthly",sourceId:Object.keys(d.monthlyOccurrences)[0],amountMinor:10000,currency:"DOP",paidDate:"2026-09-20",method:"bankTransfer",moneyAccountId:"a",transferFeeMinor:757});
  } else {
   const s:HistoryScope=kind==="loan"?{kind:"loan",id:"l"}:kind==="card"?{kind:"card",id:"c"}:scope;
   d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:kind==="loan"?"loanPayment":kind==="card"?"payment":kind,feeMinor:757,toAccountId:"b"}));
  }
  const original=d;
  const fee=Object.values(d.moneyTransactions).find(t=>t.type==="fee"&&!t.reversedAt)!;
  const target={source:"moneyTransaction" as const,sourceId:fee.id};
  expect(resolveHistoryTarget(d,target)).toEqual(target);
  const form=historyInput(d,Object.values(d.managedExpenses),scope,target);
  expect(form.kind).toBe("fee");expect(form.amountMinor).toBe(757);
  d=commit(d,await buildHistoryUpdates(d,Object.values(d.managedExpenses),user,scope,{...form,amountMinor:300,date:"2026-09-21",name:"Comisión corregida"},target));
  expect(getMoneyAccountBalance(d,"a")-getMoneyAccountBalance(original,"a")).toBe(457);
  expect(d.moneyTransactions[fee.id]).toMatchObject({amountMinor:300,transactionDate:"2026-09-21",description:"Comisión corregida"});
  d=commit(d,await buildHistoryUpdates(d,Object.values(d.managedExpenses),user,scope,historyInput(d,Object.values(d.managedExpenses),scope,target),target,true));
  expect(getMoneyAccountBalance(d,"a")-getMoneyAccountBalance(original,"a")).toBe(757);
  for(const t of Object.values(original.moneyTransactions).filter(t=>t.type!=="fee")) expect(d.moneyTransactions[t.id]).toEqual(t);
  expect(d.monthlyOccurrences).toEqual(original.monthlyOccurrences);
  expect(d.loanTransactions).toEqual(original.loanTransactions);
  expect(getLoanBalance(d,"l")).toBe(getLoanBalance(original,"l"));
  expect(getCardCurrentDebt(d,"c","DOP")).toBe(getCardCurrentDebt(original,"c","DOP"));
  const p=Object.values(d.payments).find(p=>!p.reversedAt);
  if(p) {expect(p).toMatchObject({amountMinor:10000,paidDate:"2026-09-20"});expect(p.feeMoneyTransactionId).toBeUndefined();expect(p.transferFeeMinor).toBeUndefined();}
  if(kind==="expense") expect(Object.values(d.managedExpenses)[0]).toMatchObject({transferFeeCents:0,unitPriceCents:10000,occurredDate:"2026-09-20"});
  if(kind==="card") {expect(Object.values(d.cardTransactions)[0]).toMatchObject({amountMinor:10000,transactionDate:"2026-09-20"});expect(Object.values(d.cardTransactions)[0].transferFeeMinor).toBeUndefined();}
  // A later edit to the parent must not recreate the removed fee.
  const main=Object.values(d.moneyTransactions).find(t=>t.type!=="fee"&&t.direction==="out"&&!t.reversedAt)!;
  const parent={source:"moneyTransaction" as const,sourceId:main.id};
  const parentInput=historyInput(d,Object.values(d.managedExpenses),scope,parent);
  expect(parentInput.feeMinor).toBe(0);
  d=commit(d,await buildHistoryUpdates(d,Object.values(d.managedExpenses),user,scope,{...parentInput,name:"Descripción corregida"},parent));
  expect(Object.values(d.moneyTransactions).filter(t=>t.type==="fee"&&!t.reversedAt)).toHaveLength(0);
 });
 it("creates, edits and deletes an expense without duplicating its ledger entry",async()=>{
  let d=fixture();d=commit(d,await buildHistoryUpdates(d,[],user,scope,input(d)));
  const t=Object.values(d.moneyTransactions).find(t=>t.type==="expense")!;const target={source:"moneyTransaction" as const,sourceId:t.id};
  const e=Object.values(d.managedExpenses);const edit=historyInput(d,e,scope,target);
  d=commit(d,await buildHistoryUpdates(d,e,user,scope,{...edit,amountMinor:20000,accountId:"b"},target));
  expect(getMoneyAccountBalance(d,"a")).toBe(1000000);expect(getMoneyAccountBalance(d,"b")).toBe(980000);
  expect(buildSpendingHistory(d,Object.values(d.managedExpenses))[0].amountMinor).toBe(20000);
  d=commit(d,await buildHistoryUpdates(d,Object.values(d.managedExpenses),user,scope,historyInput(d,Object.values(d.managedExpenses),scope,target),target,true));
  expect(getMoneyAccountBalance(d,"b")).toBe(1000000);expect(Object.values(d.managedExpenses)[0].deletedAt).toBeTruthy();
 });
 it("updates both transfer legs and fee when opened from the receiving account",async()=>{
  let d=fixture();d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...input(d),kind:"transfer",toAccountId:"b",feeMinor:50}));
  const inbound=Object.values(d.moneyTransactions).find(t=>t.direction==="in")!;const target={source:"moneyTransaction" as const,sourceId:inbound.id};
  expect(resolveHistoryTarget(d,target).sourceId).not.toBe(inbound.id);
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...historyInput(d,[],scope,target),amountMinor:15000,feeMinor:100},target));
  expect(getMoneyAccountBalance(d,"a")).toBe(984900);expect(getMoneyAccountBalance(d,"b")).toBe(1015000);
  const active=Object.values(d.moneyTransactions).find(t=>t.type==="transfer"&&!t.reversedAt)!;const current={source:"moneyTransaction" as const,sourceId:active.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,historyInput(d,[],scope,current),current,true));
  expect(getMoneyAccountBalance(d,"a")).toBe(1000000);expect(getMoneyAccountBalance(d,"b")).toBe(1000000);
 });
 it("edits and deletes received income together with its occurrence",async()=>{
  let d=fixture();d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...input(d),kind:"income"}));
  const t=Object.values(d.moneyTransactions)[0], target={source:"moneyTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...historyInput(d,[],scope,target),amountMinor:30000,accountId:"b"},target));
  expect(getMoneyAccountBalance(d,"a")).toBe(1000000);expect(getMoneyAccountBalance(d,"b")).toBe(1030000);
  expect(Object.values(d.incomeOccurrences)[0].actualAmountMinor).toBe(30000);
 });
 it("keeps card debt and withdrawal aligned when correcting a card payment",async()=>{
  let d=fixture();const s:HistoryScope={kind:"card",id:"c"};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:"payment"}));
  const t=Object.values(d.moneyTransactions).find(t=>t.type==="cardPayment")!;const target={source:"moneyTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...historyInput(d,[],scope,target),amountMinor:20000,accountId:"b"},target));
  expect(getCardCurrentDebt(d,"c","DOP")).toBe(80000);expect(getMoneyAccountBalance(d,"a")).toBe(1000000);expect(getMoneyAccountBalance(d,"b")).toBe(980000);
 });
 it("adds cashback without a bank withdrawal and supports negative debt adjustments",async()=>{
  let d=fixture();const s:HistoryScope={kind:"card",id:"c"};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:"credit"}));
  expect(Object.values(d.moneyTransactions)).toHaveLength(0);expect(getCardCurrentDebt(d,"c","DOP")).toBe(90000);
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:"adjustment",amountMinor:-1000}));
  const t=Object.values(d.cardTransactions).find(t=>t.type==="adjustment")!;const target={source:"cardTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...historyInput(d,[],s,target),amountMinor:-2000},target));
  expect(getCardCurrentDebt(d,"c","DOP")).toBe(88000);
 });
 it("creates a loan payment and corrects principal, interest, bank and obligation atomically",async()=>{
  let d=fixture();const s:HistoryScope={kind:"loan",id:"l"};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),interestMinor:1000}));
  expect(getLoanBalance(d,"l")).toBe(91000);
  const t=Object.values(d.loanTransactions)[0], target={source:"loanTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...historyInput(d,[],s,target),amountMinor:15000,interestMinor:2000},target));
  expect(getLoanBalance(d,"l")).toBe(87000);expect(getMoneyAccountBalance(d,"a")).toBe(985000);
  expect(Object.values(d.payments).filter(p=>!p.reversedAt)).toHaveLength(1);
 });
 it("blocks closed original/destination dates, additions and stale queued edits",async()=>{
  let d=fixture();d=commit(d,await buildHistoryUpdates(d,[],user,scope,input(d)));
  const t=Object.values(d.moneyTransactions)[0],target={source:"moneyTransaction" as const,sourceId:t.id},expenses=Object.values(d.managedExpenses);
  const patch=await buildHistoryUpdates(d,expenses,user,scope,{...historyInput(d,expenses,scope,target),date:"2026-10-16"},target);
  const closing=buildClosing(d,"2026-09",1,{},"",user.uid);d.cycleClosings[closing.id]=closing;
  await expect(buildHistoryUpdates(d,expenses,user,scope,{...historyInput(d,expenses,scope,target),date:"2026-10-16"},target)).rejects.toThrow(/cerrado/);
  expect(()=>assertOpenHistoryUpdates(d,patch)).toThrow(/cerrado/);
  expect(reconcileVersionedUpdates(d,patch).conflict).toBe(true);
  await expect(buildHistoryUpdates(d,[],user,scope,input(d))).rejects.toThrow(/cerrado/);
  const open=await buildHistoryUpdates(d,[],user,scope,{...input(d),date:"2026-10-16"});expect(()=>assertOpenHistoryUpdates(d,open)).not.toThrow();
 });
 it("records USD account expenses in USD",async()=>{
  let d=fixture();d.moneyAccounts.a.currency="USD";
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...input(d),currency:"USD"}));
  expect(Object.values(d.moneyTransactions)[0].currency).toBe("USD");
 });
 it("edits and removes loan adjustments while preserving valid snapshots",async()=>{
  let d=fixture();const s:HistoryScope={kind:"loan",id:"l"};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:"adjustment",amountMinor:-5000}));
  const t=Object.values(d.loanTransactions)[0],target={source:"loanTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...historyInput(d,[],s,target),amountMinor:-10000},target));
  expect(getLoanBalance(d,"l")).toBe(90000);
  d=commit(d,await buildHistoryUpdates(d,[],user,s,historyInput(d,[],s,target),target,true));
  expect(getLoanBalance(d,"l")).toBe(100000);
 });
 it("preserves USD debt and DOP settlement when editing a card payment",async()=>{
  let d=fixture();const s:HistoryScope={kind:"card",id:"c",currency:"USD"};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...input(d,s),kind:"payment",amountMinor:1000,settlementMinor:60000}));
  const t=Object.values(d.cardTransactions)[0],target={source:"cardTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,s,{...historyInput(d,[],s,target),amountMinor:2000,settlementMinor:120000},target));
  expect(getCardCurrentDebt(d,"c","USD")).toBe(8000);expect(getMoneyAccountBalance(d,"a")).toBe(880000);
 });
 it("deleting income restores the bank balance and marks the receipt unpaid",async()=>{
  let d=fixture();d=commit(d,await buildHistoryUpdates(d,[],user,scope,{...input(d),kind:"income"}));
  const t=Object.values(d.moneyTransactions)[0],target={source:"moneyTransaction" as const,sourceId:t.id};
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,historyInput(d,[],scope,target),target,true));
  expect(getMoneyAccountBalance(d,"a")).toBe(1000000);expect(Object.values(d.incomeOccurrences)[0].status).toBe("expected");
 });
 it("rejects moving an open transaction into a closed period",async()=>{
  let d=fixture();const closing=buildClosing(d,"2026-08",1,{},"",user.uid);d.cycleClosings[closing.id]=closing;
  d=commit(d,await buildHistoryUpdates(d,[],user,scope,input(d)));
  const t=Object.values(d.moneyTransactions)[0],target={source:"moneyTransaction" as const,sourceId:t.id},expenses=Object.values(d.managedExpenses);
  await expect(buildHistoryUpdates(d,expenses,user,scope,{...historyInput(d,expenses,scope,target),date:"2026-08-20"},target)).rejects.toThrow(/cerrado/);
 });

 it("keeps an explicitly unclosed earlier cycle editable",async()=>{
  const d=fixture();const closing=buildClosing(d,"2026-09",1,{},"",user.uid);d.cycleClosings[closing.id]=closing;
  const patch=await buildHistoryUpdates(d,[],user,scope,{...input(d),date:"2026-08-20"});
  expect(()=>assertOpenHistoryUpdates(d,patch)).not.toThrow();
 });

});
