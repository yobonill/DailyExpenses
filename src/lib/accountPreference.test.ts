import { describe,it,expect } from "vitest";
import { createEmptyFinancialData } from "./financialState";
import { reviewMeta } from "./financialReview";
import { getActiveBankAccounts,compareMoneyAccounts } from "./moneyLedger";
import { historyInput } from "./accountHistory";
const fixture=()=>{const d=createEmptyFinancialData(),meta=reviewMeta("test");for(const [id,name] of [["bhd","BHD"],["popular","Popular"],["scotia","Scotiabank"]])d.banks[id]={id,name,active:true,...meta};for(const [id,name,bankId] of [["alcanza","Alcanza","bhd"],["nomina","Nómina","popular"],["ahorro","Ahorros personal","scotia"]])d.moneyAccounts[id]={id,name,bankId,kind:"bank",accountType:"savings",currency:"DOP",active:true,openingDate:"2026-08-15",openingBalanceMinor:100000,...meta};return d;};
describe("bank account preferences",()=>{
 it("defaults to Popular Nómina and leaves Alcanza last and selectable",()=>{
  const d=fixture();expect(getActiveBankAccounts(d).map(a=>a.id)).toEqual(["nomina","ahorro","alcanza"]);
  const all=[...Object.values(d.moneyAccounts),{...d.moneyAccounts.nomina,id:"cash",name:"Efectivo",kind:"cash" as const,bankId:undefined}].sort((a,b)=>compareMoneyAccounts(d,a,b));expect(all.at(-1)?.id).toBe("alcanza");
 });
 it("only defaults to eligible active accounts of the selected currency",()=>{
  const d=fixture();d.moneyAccounts.nomina.active=false;expect(getActiveBankAccounts(d)[0].id).toBe("ahorro");expect(getActiveBankAccounts(d,"USD")).toEqual([]);
 });
 it("uses Popular for a new product movement but preserves an existing source",()=>{
  const d=fixture();expect(historyInput(d,[],{kind:"card",id:"card"}).accountId).toBe("nomina");
  d.moneyTransactions.f={id:"f",accountId:"alcanza",type:"fee",direction:"out",amountMinor:100,currency:"DOP",transactionDate:"2026-09-20",description:"Comisión",...reviewMeta("test")};
  expect(historyInput(d,[],{kind:"bank",id:"bhd"},{source:"moneyTransaction",sourceId:"f"}).accountId).toBe("alcanza");
 });
});
