import type { FinancialData } from "../models/finance";
import { getQuincenaRange } from "./date";

/** Respect the application's explicit quincena closing records; open periods remain editable. */
export function isHistoryDateLocked(data: FinancialData, date: string): boolean {
  return Boolean(date && Object.values(data.cycleClosings).some(c => {
    const range = getQuincenaRange(c.financialMonth, c.quincena);
    return date >= range.startDateKey && date <= range.endDateKey;
  }));
}
export function assertHistoryDateOpen(data: FinancialData, date: string): void {
  if (isHistoryDateLocked(data, date)) throw new Error("No se puede modificar un ciclo cerrado. Selecciona una fecha de un ciclo abierto.");
}
export function assertOpenHistoryUpdates(data: FinancialData, updates: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(updates)) {
    const [group, id] = path.split("/");
    if (!/^(moneyTransactions|cardTransactions|loanTransactions|savingsTransactions|payments|managedExpenses|incomeOccurrences)$/.test(group)) continue;
    const old = (data[group as keyof FinancialData] as unknown as Record<string, Record<string, unknown>>)?.[id];
    const next = value as Record<string, unknown> | null;
    // The explicit closing reconciliation workflow establishes the next opening balance.
    if (!old && group === "moneyTransactions" && next?.closingReconciliationId && updates[`cycleClosings/${next.closingReconciliationId}`]) continue;
    if (!old && group === "cardTransactions" && next?.closingReconciliationId && updates[`cycleClosings/${next.closingReconciliationId}`]) continue;
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    for (const row of [old, next]) {
      if (!row) continue;
      if (group === "incomeOccurrences" && row.status !== "received") continue;
      const date = row.transactionDate || row.occurredDate || row.reportingExactDate || row.paidDate || row.receivedDate;
      if (date) assertHistoryDateOpen(data, String(date));
      if (group === "payments" && row.historical) {
        const occurrence = row.sourceType === "monthly" ? data.monthlyOccurrences[String(row.sourceId)] : data.nonMonthlyOccurrences[String(row.sourceId)];
        if (occurrence && "financialMonth" in occurrence) assertHistoryDateOpen(data, getQuincenaRange(occurrence.financialMonth, occurrence.quincena).startDateKey);
      }
    }
  }
}
