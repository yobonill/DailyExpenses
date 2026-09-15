import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEmptyFinancialData, normalizeFinancialData, applyFinancialUpdates } from "./financialState";
import { balancesAt, buildClosing, closingNeedsReview, createBalanceIssues, reviewMeta, validatePastDate } from "./financialReview";
import { prepareReviewedUpdates } from "./reviewedUpdates";
import { isFinanciallyConsistent, reconcileVersionedUpdates } from "./financialIntegrity";
import { buildExpenseUpdates, buildMovementEdit, mergedExpenses, type MovementEdit } from "./movementEditing";
import { buildSpendingHistory, getSpendingTotals } from "./spendingHistory";
import { toggleFilterSelection } from "./filterSelection";
import type { AppUserDefinition } from "../config/appUsers";
import type { Expense } from "../models/expense";
import { createFinanceActions } from "../hooks/useFinanceActions";

const user = {uid:"tester"} as AppUserDefinition;
const meta = reviewMeta(user.uid);
const fixture = () => {
  const d=createEmptyFinancialData();
  d.moneyAccounts.cash={id:"cash",kind:"cash",name:"Efectivo",currency:"DOP",openingBalanceMinor:10000,openingDate:"2026-08-15",active:true,...meta};
  return d;
};
const expense = (amount=15000):Expense=>({id:"extra",name:"Compra",category:"Alimentación",occurredDate:"2026-08-20",occurredAt:"2026-08-20T12:00:00Z",unitPriceCents:amount,quantity:1,paymentMethod:"cash",moneyAccountId:"cash",currency:"DOP",status:"transferred",createdAt:"2026-08-20T12:00:00Z",updatedAt:"2026-08-20T12:00:00Z"});
const prompts = {warn:()=>{},confirm:()=>true};
describe("reviewed financial operations",()=>{
  it("switches All to one choice and preserves multi-selection",()=>{
    expect(toggleFilterSelection(null,"food",["food","health","home"])).toEqual(["food"]);
    expect(toggleFilterSelection(["food"],"health",["food","health","home"])).toEqual(["food","health"]);
    expect(toggleFilterSelection(["food"],"food",["food","health"])).toEqual([]);
    expect(toggleFilterSelection(["food"],"health",["food","health"])).toBeNull();
  });
  it("rejects future and invalid calendar dates",()=>{
    expect(()=>validatePastDate("2026-02-30")).toThrow();
    expect(()=>validatePastDate("2026-09-16","2026-09-15")).toThrow();
    expect(()=>validatePastDate("2024-02-29","2026-09-15")).not.toThrow();
  });
  it("requires confirmation and saves an overdraft issue with the expense atomically",async()=>{
    const d=fixture();const patch=await buildExpenseUpdates(d,user,expense());
    expect(()=>prepareReviewedUpdates(d,patch,user.uid,{warn:()=>{},confirm:()=>false})).toThrow();
    expect(Object.keys(d.managedExpenses)).toHaveLength(0);
    const reviewed=prepareReviewedUpdates(d,patch,user.uid,prompts);const result=applyFinancialUpdates(d,reviewed);
    expect(isFinanciallyConsistent(result)).toBe(true);
    expect(balancesAt(result,"2026-08-29")[0].calculatedMinor).toBe(-5000);
    expect(Object.values(result.balanceIssues)[0].differenceMinor).toBe(5000);
    expect(mergedExpenses(result,[expense()])).toHaveLength(1);
    expect(Object.keys(result.changeAudits)).toHaveLength(1);
  });
  it("flags a deficit caused later by a backdated expense",async()=>{
    const d=fixture();d.moneyTransactions.later={id:"later",accountId:"cash",currency:"DOP",direction:"out",type:"expense",amountMinor:9000,transactionDate:"2026-08-25",description:"Otro gasto",...meta};
    const issues=createBalanceIssues(d,await buildExpenseUpdates(d,user,expense(2000)),user.uid);
    expect(issues[0].date).toBe("2026-08-25");expect(issues[0].differenceMinor).toBe(1000);
  });
  it("checks the earlier date when an existing expense is moved backwards",async()=>{
    let d=fixture();
    d.moneyTransactions.income={id:"income",accountId:"cash",currency:"DOP",direction:"in",type:"income",amountMinor:10000,transactionDate:"2026-08-25",description:"Ingreso",...meta};
    const original={...expense(15000),occurredDate:"2026-08-28"};
    d=applyFinancialUpdates(d,await buildExpenseUpdates(d,user,original));
    const issues=createBalanceIssues(d,await buildExpenseUpdates(d,user,{...original,occurredDate:"2026-08-20"}),user.uid);
    expect(issues[0].date).toBe("2026-08-20");
    expect(issues[0].differenceMinor).toBe(5000);
  });
  it("keeps closure revisions and invalidates affected earlier/later snapshots",async()=>{
    const d=fixture();const c=buildClosing(d,"2026-08",1,{"account:cash":10000},"",user.uid);
    expect(c.status).toBe("reconciled");d.cycleClosings[c.id]=c;
    expect(closingNeedsReview(d,c)).toBe(false);
    const changed=applyFinancialUpdates(d,await buildExpenseUpdates(d,user,expense(1000)));
    expect(closingNeedsReview(changed,c)).toBe(true);
    const second=buildClosing(changed,"2026-08",1,{},"",user.uid);expect(second.revision).toBe(2);expect(second.status).toBe("incomplete");
    expect(d.cycleClosings[c.id].balances[0].calculatedMinor).toBe(10000);
  });
  it("rejects a stale device revision instead of partially applying it",()=>{
    const d=fixture();d.reviewControl={...meta,version:3};
    expect(reconcileVersionedUpdates(d,{reviewControl:{...meta,version:3},"moneyTransactions/x":{id:"x",...meta}}).conflict).toBe(true);
  });
  it("retains reviewed issues after later income",async()=>{
    const d=fixture();const next=applyFinancialUpdates(d,prepareReviewedUpdates(d,await buildExpenseUpdates(d,user,expense()),user.uid,prompts));
    const withIncome=applyFinancialUpdates(next,{"moneyTransactions/income":{id:"income",accountId:"cash",type:"income",direction:"in",amountMinor:10000,currency:"DOP",transactionDate:"2026-08-21",description:"Ingreso",...meta}});
    expect(Object.values(withIncome.balanceIssues)[0].status).toBe("pending");
  });
  it("moves an extra from cash to credit without duplicating its expense",async()=>{
    const d=fixture(); d.creditCards.card={id:"card",name:"Tarjeta",cutDay:10,dueDay:30,active:true,openingDate:"2026-08-15",openingCurrentDebtDopMinor:0,openingCurrentDebtUsdMinor:0,openingStatementDopMinor:0,openingStatementUsdMinor:0,creditLimitDopMinor:100000,...meta};
    const first=applyFinancialUpdates(d,prepareReviewedUpdates(d,await buildExpenseUpdates(d,user,expense(5000)),user.uid,prompts));
    const second=applyFinancialUpdates(first,prepareReviewedUpdates(first,await buildExpenseUpdates(first,user,{...expense(5000),paymentMethod:"creditCard",moneyAccountId:undefined}),user.uid,prompts));
    expect(balancesAt(second,"2026-08-29").find(b=>b.kind==="account")?.calculatedMinor).toBe(10000);
    expect(balancesAt(second,"2026-08-29").find(b=>b.key==="card:card:DOP")?.calculatedMinor).toBe(5000);
    expect(getSpendingTotals(buildSpendingHistory(second,mergedExpenses(second,[]))).total.DOP).toBe(5000);
  });
  it("edits and reverses a loan payment while updating later snapshots",async()=>{
    let d=fixture();d.moneyAccounts.cash.openingBalanceMinor=100000;
    d.loans.loan={id:"loan",name:"Préstamo",lender:"Entidad",currency:"DOP",openingBalanceMinor:50000,openingDate:"2026-08-15",annualInterestRate:0,active:true,...meta};
    d.monthlyOccurrences.bill={id:"bill",name:"Cuota",category:"Deudas y préstamos",loanId:"loan",expectedAmountMinor:10000,currency:"DOP",dueDate:"2026-08-20",financialMonth:"2026-08",quincena:1,status:"upcoming",canPayWithCard:false,...meta};
    await createFinanceActions({data:d,user,commitUpdates:async p=>{d=applyFinancialUpdates(d,p);}}).payObligation({sourceType:"monthly",sourceId:"bill",amountMinor:10000,currency:"DOP",paidDate:"2026-08-20",method:"cash",loanInterestMinor:1000});
    const id=d.monthlyOccurrences.bill.paymentId!;
    d.monthlyOccurrences.later={...d.monthlyOccurrences.bill,id:"later",status:"upcoming",paymentId:undefined,actualAmountMinor:undefined,dueDate:"2026-08-28"};
    await createFinanceActions({data:d,user,commitUpdates:async p=>{d=applyFinancialUpdates(d,p);}}).payObligation({sourceType:"monthly",sourceId:"later",amountMinor:5000,currency:"DOP",paidDate:"2026-08-28",method:"cash",loanInterestMinor:0});
    const input:MovementEdit={date:"2026-08-21",amountMinor:12000,name:"Cuota",category:"Deudas y préstamos",method:"cash",currency:"DOP",accountId:"cash",cardId:"",fundId:"",feeMinor:0,settlementMinor:0,interestMinor:1000,chargesMinor:0,notes:"Corregido"};
    const edited=applyFinancialUpdates(d,prepareReviewedUpdates(d,await buildMovementEdit(d,user,{source:"payment",sourceId:id},input),user.uid,prompts));
    expect(isFinanciallyConsistent(edited)).toBe(true);
    expect(Object.values(edited.loanTransactions).find(t=>!t.reversedAt && t.transactionDate==="2026-08-21")?.balanceAfterMinor).toBe(39000);
    expect(Object.values(edited.loanTransactions).find(t=>!t.reversedAt && t.transactionDate==="2026-08-28")?.balanceAfterMinor).toBe(34000);
    expect(edited.monthlyOccurrences.bill.actualAmountMinor).toBe(12000);
    expect(edited.payments[id].reversedAt).toBeTruthy();
  });
  it("preserves the savings consumed by a corrected non-monthly payment",async()=>{
    let d=fixture();
    d.savingsFunds.fund={id:"fund",name:"Salud",currency:"DOP",active:true,moneyAccountId:"cash",...meta};
    d.savingsTransactions.seed={id:"seed",fundId:"fund",type:"deposit",amountMinor:8000,currency:"DOP",transactionDate:"2026-08-15",...meta};
    d.nonMonthlyOccurrences.health={id:"health",planId:"plan",name:"Consulta",category:"Salud",expectedAmountMinor:5000,currency:"DOP",dueDate:"2026-08-20",financialMonth:"2026-08",quincena:1,status:"upcoming",canPayWithCard:true,...meta};
    d.savingsAllocations.a={id:"a",fundId:"fund",obligationType:"nonMonthly",obligationId:"health",amountMinor:5000,currency:"DOP",active:true,...meta};
    await createFinanceActions({data:d,user,commitUpdates:async p=>{d=applyFinancialUpdates(d,p);}}).payObligation({sourceType:"nonMonthly",sourceId:"health",amountMinor:5000,currency:"DOP",paidDate:"2026-08-20",method:"cash",consumeReservedSavings:true});
    const input:MovementEdit={date:"2026-08-21",amountMinor:4000,name:"Consulta",category:"Salud",method:"cash",currency:"DOP",accountId:"cash",cardId:"",fundId:"",feeMinor:0,settlementMinor:0,interestMinor:0,chargesMinor:0,notes:"Corrección"};
    const patch=await buildMovementEdit(d,user,{source:"payment",sourceId:d.nonMonthlyOccurrences.health.paymentId!},input);
    const next=applyFinancialUpdates(d,prepareReviewedUpdates(d,patch,user.uid,prompts));
    expect(isFinanciallyConsistent(next)).toBe(true);
    expect(Object.values(next.savingsTransactions).filter(t=>t.type==="withdrawal"&&!t.reversedAt).map(t=>t.amountMinor)).toEqual([4000]);
    expect(next.savingsAllocations.a.active).toBe(false);
  });
  it("preserves savings funding when replacing a credit-card payment",async()=>{
    let d=fixture();
    d.creditCards.card={id:"card",name:"Tarjeta",cutDay:10,dueDay:30,active:true,openingDate:"2026-08-15",openingCurrentDebtDopMinor:20000,openingCurrentDebtUsdMinor:0,openingStatementDopMinor:0,openingStatementUsdMinor:0,...meta};
    d.savingsFunds.fund={id:"fund",name:"Fondo",currency:"DOP",active:true,moneyAccountId:"cash",...meta};
    d.savingsTransactions.seed={id:"seed",fundId:"fund",type:"deposit",amountMinor:8000,currency:"DOP",transactionDate:"2026-08-15",...meta};
    await createFinanceActions({data:d,user,commitUpdates:async p=>{d=applyFinancialUpdates(d,p);}}).addCardTransaction("card","DOP","payment",5000,"2026-08-20","Pago","fund",undefined,true,"cash","cash");
    const id=Object.values(d.cardTransactions).find(t=>t.type==="payment")!.id;
    const input:MovementEdit={date:"2026-08-21",amountMinor:4000,name:"Pago",category:"Deudas y préstamos",method:"cash",currency:"DOP",accountId:"cash",cardId:"card",fundId:"fund",feeMinor:0,settlementMinor:0,interestMinor:0,chargesMinor:0,notes:"Corrección"};
    const next=applyFinancialUpdates(d,prepareReviewedUpdates(d,await buildMovementEdit(d,user,{source:"cardTransaction",sourceId:id},input),user.uid,prompts));
    expect(isFinanciallyConsistent(next)).toBe(true);
    expect(Object.values(next.savingsTransactions).filter(t=>t.type==="withdrawal"&&!t.reversedAt).map(t=>t.amountMinor)).toEqual([4000]);
    expect(balancesAt(next,"2026-08-29").find(b=>b.key==="card:card:DOP")?.calculatedMinor).toBe(16000);
  });
});

const backupPath=process.env.DAILY_EXPENSES_BACKUP;
describe.skipIf(!backupPath)("current user backup compatibility",()=>{
  it("preserves classifications, totals and balances on normalization",()=>{
    const backup=JSON.parse(readFileSync(backupPath!,"utf8"));const d=normalizeFinancialData(backup.financialData);
    expect(isFinanciallyConsistent(d)).toBe(true);
    expect(Object.values(d.payments).filter(p=>p.reportingMethod)).toHaveLength(19);
    expect(getSpendingTotals(buildSpendingHistory(d,backup.expenses))).toEqual(getSpendingTotals(buildSpendingHistory(normalizeFinancialData(JSON.parse(JSON.stringify(d))),backup.expenses)));
  });
  it("corrects every classified historical payment without altering current balances",async()=>{
    const backup=JSON.parse(readFileSync(backupPath!,"utf8"));const d=normalizeFinancialData(backup.financialData);
    for(const p of Object.values(d.payments).filter(p=>p.historical && !p.reversedAt)){
      const o=(p.sourceType==="monthly"?d.monthlyOccurrences:d.nonMonthlyOccurrences)[p.sourceId];
      const input:MovementEdit={date:"2026-08-20",name:o.name,category:o.category||"Otros",amountMinor:p.amountMinor+100,currency:p.currency,method:p.reportingMethod!,accountId:p.reportingMoneyAccountId||"",cardId:p.reportingCardId||"",fundId:"",feeMinor:0,settlementMinor:0,interestMinor:0,chargesMinor:0,notes:"Corrección de prueba"};
      const next=applyFinancialUpdates(d,await buildMovementEdit(d,user,{source:"payment",sourceId:p.id},input));
      expect(balancesAt(next,"2026-09-15")).toEqual(balancesAt(d,"2026-09-15"));
      expect(isFinanciallyConsistent(next)).toBe(true);
      expect(buildSpendingHistory(next,backup.expenses).find(e=>e.sourceId===p.id)?.date).toBe(input.date);
    }
  });
  it("edits the live payments in the backup, keeping later recurrence definitions intact",async()=>{
    const backup=JSON.parse(readFileSync(backupPath!,"utf8"));const d=normalizeFinancialData(backup.financialData);
    for(const p of Object.values(d.payments).filter(p=>!p.historical && !p.reversedAt)) {
      const o=(p.sourceType==="monthly"?d.monthlyOccurrences:d.nonMonthlyOccurrences)[p.sourceId];
      const input:MovementEdit={date:p.paidDate,name:o.name,category:o.category||"Otros",amountMinor:p.amountMinor+100,currency:p.currency,method:p.method,accountId:p.moneyAccountId||"",cardId:p.cardId||"",fundId:"",feeMinor:p.transferFeeMinor||0,settlementMinor:p.settlementAmountDopMinor||0,interestMinor:0,chargesMinor:0,notes:"Prueba"};
      const patch=await buildMovementEdit(d,user,{source:"payment",sourceId:p.id},input);
      const next=applyFinancialUpdates(d,prepareReviewedUpdates(d,patch,user.uid,prompts));
      expect(isFinanciallyConsistent(next)).toBe(true);
      expect(next.nonMonthlyExpenses).toEqual(d.nonMonthlyExpenses);
      expect(Object.values(next.payments).filter(x=>!x.reversedAt && x.sourceId===p.sourceId)).toHaveLength(1);
    }
  });
});
