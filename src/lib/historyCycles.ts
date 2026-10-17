import type { FinancialData } from "../models/finance";
import { getBudgetCycleRange, getMonthKey, getQuincenaRange, toLocalDateKey } from "./date";
import { assertHistoryDateOpen, isHistoryDateLocked } from "./openCycles";
import { validatePastDate } from "./financialReview";

/** A financial cycle runs from the 15th to the following 14th.
 * Closings are per quincena, so the other half remains available until closed. */
export function movementCycleBounds(data: FinancialData, month: string, today=toLocalDateKey()) {
  const open=([1,2] as const).map(q=>getQuincenaRange(month,q))
    .filter(r=>r.startDateKey<=today&&!isHistoryDateLocked(data,r.startDateKey));
  if(!open.length)return null;
  return {startDateKey:open[0].startDateKey,endDateKey:open.at(-1)!.endDateKey<today?open.at(-1)!.endDateKey:today};
}
export function historyCycleMonths(data: FinancialData, today=toLocalDateKey()): string[] {
  const dates=[today,data.settings.trackingStartDate,
    ...Object.values(data.moneyAccounts).map(x=>x.openingDate),
    ...Object.values(data.creditCards).map(x=>x.openingDate),
    ...Object.values(data.loans).map(x=>x.openingDate),
    ...Object.values(data.moneyTransactions).map(x=>x.transactionDate),
    ...Object.values(data.cardTransactions).map(x=>x.transactionDate),
    ...Object.values(data.loanTransactions).map(x=>x.transactionDate),
    ...Object.values(data.cycleClosings).map(x=>getBudgetCycleRange(x.financialMonth).startDateKey),
  ].filter((d):d is string=>Boolean(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=today));
  const earliest=dates.sort()[0] || today;
  const first=getMonthKey(earliest), last=getMonthKey(today), months:string[]=[];
  let [year,month]=first.split("-").map(Number);
  while(`${year}-${String(month).padStart(2,"0")}`<=last){months.push(`${year}-${String(month).padStart(2,"0")}`);if(++month>12){month=1;year++;}}
  return months.reverse();
}
export function cycleStatus(data:FinancialData,month:string) {
  const count=([1,2] as const).filter(q=>isHistoryDateLocked(data,getQuincenaRange(month,q).startDateKey)).length;
  return count===2?"Cerrado":count===1?"Parcialmente cerrado":"Abierto";
}
export function assertMovementCycleDate(data:FinancialData,month:string,date:string,today=toLocalDateKey()) {
  if(!/^\d{4}-\d{2}$/.test(month)||!historyCycleMonths(data,today).includes(month))throw new Error("Selecciona un ciclo disponible.");
  const bounds=movementCycleBounds(data,month,today);
  if(!bounds)throw new Error("El ciclo seleccionado está cerrado o todavía no tiene fechas disponibles.");
  validatePastDate(date,today);
  if(getMonthKey(date)!==month||date<bounds.startDateKey||date>bounds.endDateKey)throw new Error("La fecha debe pertenecer al ciclo abierto seleccionado.");
  assertHistoryDateOpen(data,date);
}
