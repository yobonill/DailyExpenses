import type { FinancialData, RecordMetadata } from "../models/finance";
import { applyFinancialUpdates } from "./financialState";
import { balancesAt, createBalanceIssues, reviewMeta, touchedClosedCycles, validatePastDate } from "./financialReview";
import { toLocalDateKey } from "./date";
import { isFinanciallyConsistent } from "./financialIntegrity";
import { formatCurrency } from "./money";
import { createId } from "./id";

export interface ReviewPrompts { warn(message: string): void; confirm(message: string): boolean }
export function prepareReviewedUpdates(data: FinancialData, requested: Record<string, unknown>, actor: string, prompts: ReviewPrompts): Record<string, unknown> {
  const updates = { ...requested };
  const before: Record<string, unknown> = {};
  let isEdit = false;
  for (const [path, value] of Object.entries(updates)) {
    const [collection, id] = path.split("/");
    const original = id ? (data[collection as keyof FinancialData] as Record<string, unknown> | undefined)?.[id] : undefined;
    before[path] = original || null;
    const r = value as Record<string, unknown> | null;
    if (/^(payments|moneyTransactions|cardTransactions|savingsTransactions|loanTransactions|managedExpenses)\//.test(path) && r) {
      const date = r.paidDate || r.transactionDate || r.occurredDate;
      // Existing historical rows can preserve an unknown date; all new dates are validated.
      const old = original as Record<string, unknown> | undefined;
      if (date && (!old || date !== (old.paidDate || old.transactionDate || old.occurredDate))) validatePastDate(String(date));
      if (original) isEdit = true;
    }
    if (r && typeof r.version === "number" && original) {
      if (r.version !== ((original as RecordMetadata).version || 0) + 1) throw new Error("Este registro cambió mientras lo editabas. Abre nuevamente el movimiento para revisar la versión actual.");
    }
  }
  let candidate = applyFinancialUpdates(data, updates);
  // Historical loan edits must recalculate subsequent snapshots, retaining adjustments as deltas.
  const changedLoans = new Set(Object.entries(updates).filter(([p]) => p.startsWith("loanTransactions/")).map(([,v]) => (v as {loanId?:string})?.loanId));
  for (const loanId of changedLoans) {
    if (!loanId || !candidate.loans[loanId]) continue;
    let balance = candidate.loans[loanId].openingBalanceMinor;
    const transactions = Object.values(candidate.loanTransactions).filter(t => t.loanId === loanId && !t.reversedAt)
      .sort((a,b) => a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const t of transactions) {
      const after = balance + (t.type === "payment" ? -(t.principalMinor || 0) : t.adjustmentMinor || 0);
      if (after < 0) throw new Error("La corrección haría que un pago posterior exceda la deuda del préstamo. Revisa esos pagos primero.");
      if (t.balanceBeforeMinor !== balance || t.balanceAfterMinor !== after) {
        updates[`loanTransactions/${t.id}`] = { ...t, balanceBeforeMinor: balance, balanceAfterMinor: after, ...reviewMeta(actor, data.loanTransactions[t.id]) };
      }
      balance = after;
    }
  }
  candidate = applyFinancialUpdates(data, updates);
  const changedCards = new Set(Object.entries(updates).filter(([p])=>p.startsWith("cardTransactions/")).map(([,v])=>(v as {cardId?:string})?.cardId));
  for (const cardId of changedCards) {
    const card = cardId ? candidate.creditCards[cardId] : undefined;
    if (!card) continue;
    for (const currency of ["DOP","USD"] as const) {
      let debt = currency === "DOP" ? card.openingCurrentDebtDopMinor : card.openingCurrentDebtUsdMinor;
      const byDate = new Map<string,number>();
      for (const t of Object.values(candidate.cardTransactions).filter(t=>t.cardId===cardId && t.currency===currency && !t.reversedAt && t.affectsCurrentBalance!==false)) {
        byDate.set(t.transactionDate,(byDate.get(t.transactionDate)||0)+((t.type==="payment"||t.type==="credit")?-t.amountMinor:t.amountMinor));
      }
      for (const [date,delta] of [...byDate].sort(([a],[b])=>a.localeCompare(b))) {
        debt += delta;
        if (debt < 0) throw new Error(`El cambio dejaría un pago o crédito superior a la deuda registrada de ${card.name} (${currency}) al ${date}. Revisa la fecha y los cargos anteriores.`);
      }
    }
  }
  const issues = createBalanceIssues(data, updates, actor);
  if (issues.length) {
    const message = issues.map(i => `${i.description}: disponible anterior ${formatCurrency(i.beforeMinor, i.currency)}; después ${formatCurrency(i.afterMinor, i.currency)} (${i.date}).`).join("\n");
    prompts.warn(`Saldo insuficiente o límite excedido.\n${message}`);
    if (!prompts.confirm(`${message}\n¿Registrar de todos modos? Se creará una incidencia pendiente de revisión. El dinero apartado no se liberará automáticamente.`)) throw new Error("Operación cancelada. No se guardó ningún cambio.");
    for (const issue of issues) updates[`balanceIssues/${issue.id}`] = issue;
  }
  candidate = applyFinancialUpdates(data, updates);
  const affected = touchedClosedCycles(data, candidate);
  if (affected.length && !prompts.confirm("Este cambio afecta una o más quincenas cerradas y sus balances posteriores. Quedarán marcadas para revisión. ¿Continuar?")) throw new Error("Operación cancelada.");
  if (isEdit) {
    const afterBalances = balancesAt(candidate,toLocalDateKey());
    const changes = balancesAt(data,toLocalDateKey()).flatMap(b=>{
      const a=afterBalances.find(x=>x.key===b.key);
      return a && (a.calculatedMinor!==b.calculatedMinor || a.reservedMinor!==b.reservedMinor) ? [`${b.name}: ${formatCurrency(b.calculatedMinor,b.currency)} → ${formatCurrency(a.calculatedMinor,b.currency)}; apartado ${formatCurrency(b.reservedMinor,b.currency)} → ${formatCurrency(a.reservedMinor,b.currency)}`] : [];
    });
    if (!prompts.confirm(`Efectos de la corrección:\n${changes.join("\n") || "Sin cambio en los balances actuales."}\nSe conservará la versión anterior. ¿Confirmar?`)) throw new Error("Operación cancelada.");
  }
  if (!isFinanciallyConsistent(candidate)) throw new Error("La operación dejaría vínculos, ahorros o deudas inconsistentes. Revisa los movimientos dependientes antes de continuar.");
  const id = createId();
  for (const path of Object.keys(updates)) {
    if (!(path in before)) {
      const [group, key] = path.split("/");
      before[path] = (data[group as keyof FinancialData] as Record<string,unknown> | undefined)?.[key] || null;
    }
  }
  const audited = Object.keys(updates).some(p => /^(payments|moneyTransactions|cardTransactions|savingsTransactions|loanTransactions|managedExpenses)\//.test(p));
  if (audited) updates[`changeAudits/${id}`] = { id, before, after: { ...updates }, description: isEdit ? "Corrección o reversión de movimiento" : "Registro de movimiento", ...reviewMeta(actor) };
  // Serializes operations against the version the user reviewed on this device.
  updates.reviewControl = reviewMeta(actor, data.reviewControl);
  return updates;
}
