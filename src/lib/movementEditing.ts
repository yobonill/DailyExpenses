import type { Expense, ExpenseEditableFields } from "../models/expense";
import type { Currency, FinancialData, PaymentMethod } from "../models/finance";
import type { AppUserDefinition } from "../config/appUsers";
import { createFinanceActions } from "../hooks/useFinanceActions";
import { applyFinancialUpdates } from "./financialState";
import { reviewMeta, validatePastDate } from "./financialReview";
import { createId } from "./id";

export type MovementTarget = { source: "payment" | "savingsTransaction" | "cardTransaction" | "moneyTransaction"; sourceId: string };
export interface MovementEdit {
  date: string; amountMinor: number; name: string; category: string;
  method: PaymentMethod; currency: Currency; accountId: string; cardId: string;
  fundId: string; feeMinor: number; settlementMinor: number;
  interestMinor: number; chargesMinor: number; notes: string;
}
export function collapsePatchVersions(data: FinancialData, patch: Record<string,unknown>): Record<string,unknown> {
  return Object.fromEntries(Object.entries(patch).map(([path,value])=>{
    const [group,id]=path.split("/");
    const original=(data[group as keyof FinancialData] as Record<string,{version?:number}>|undefined)?.[id];
    return [path,value && typeof value==="object" && "version" in value ? {...value,version:(original?.version||0)+1}:value];
  }));
}
export const mergedExpenses = (data: FinancialData, legacy: Expense[]): Expense[] => {
  const merged = new Map(legacy.map(e => [e.id, e]));
  Object.values(data.managedExpenses).forEach(e => merged.set(e.id, e));
  return [...merged.values()].filter(e => !e.deletedAt);
};
export async function buildExpenseUpdates(data: FinancialData, user: AppUserDefinition, expense: Expense, remove = false): Promise<Record<string, unknown>> {
  validatePastDate(expense.occurredDate);
  if (!remove && (!expense.category?.trim() || !expense.name.trim() || !expense.paymentMethod || !Number.isSafeInteger(expense.unitPriceCents) || expense.unitPriceCents <= 0 || !Number.isSafeInteger(expense.quantity) || expense.quantity < 1)) throw new Error("Completa nombre, monto, cantidad, categoría y forma de pago.");
  const old = data.managedExpenses[expense.id];
  const next = { ...expense, category: expense.category || "Sin categoría", paymentMethod: expense.paymentMethod || "cash", currency: expense.currency || "DOP", ...reviewMeta(user.uid, old), deletedAt: remove ? new Date().toISOString() : undefined };
  const updates: Record<string, unknown> = { [`managedExpenses/${expense.id}`]: next };
  const actions = createFinanceActions({ data, user, commitUpdates: async patch => { Object.assign(updates, patch); } });
  if (!remove && expense.includedInOpeningBalance) {
    const openingDate = expense.paymentMethod === "creditCard"
      ? Object.values(data.creditCards).find(c=>c.active && !c.archivedAt)?.openingDate
      : data.moneyAccounts[expense.paymentMethod === "cash" ? "cash" : expense.moneyAccountId || ""]?.openingDate;
    if (!openingDate || expense.occurredDate > openingDate) throw new Error("Solo puedes marcar como histórico un gasto que ya estaba incluido en el saldo inicial de la cuenta o tarjeta seleccionada.");
  }
  if (remove || expense.includedInOpeningBalance) await actions.removeDailyExpenseCardCharge(expense.id);
  else await actions.syncDailyExpenseCardCharge(expense);
  const goal = Object.values(data.purchaseGoals).find(g => g.linkedDailyExpenseId === expense.id);
  if (goal) updates[`purchaseGoals/${goal.id}`] = { ...goal, status: remove ? "active" : "purchased", purchasedAt: remove ? undefined : expense.occurredDate,
    linkedDailyExpenseId: remove ? undefined : expense.id, actualAmountMinor: remove ? undefined : expense.unitPriceCents * expense.quantity,
    category: expense.category, ...reviewMeta(user.uid, goal) };
  return updates;
}

export async function buildMovementEdit(data: FinancialData, user: AppUserDefinition, target: MovementTarget, input: MovementEdit, reverse = false): Promise<Record<string, unknown>> {
  validatePastDate(input.date);
  if (!reverse && (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || !input.category.trim())) throw new Error("Completa el monto y la categoría.");
  const updates: Record<string, unknown> = {};
  let candidate = data;
  const capture = async (patch: Record<string, unknown>) => { Object.assign(updates, patch); candidate = applyFinancialUpdates(candidate, patch); };
  const actions = () => createFinanceActions({ data: candidate, user, commitUpdates: capture });
  const now = new Date().toISOString();
  if (target.source === "payment") {
    const p = data.payments[target.sourceId];
    if (!p || p.reversedAt) throw new Error("El pago ya no está disponible.");
    const group = p.sourceType === "monthly" ? "monthlyOccurrences" : "nonMonthlyOccurrences";
    const occurrence = data[group][p.sourceId];
    if (!occurrence) throw new Error("No se encontró la obligación original.");
    if (p.historical && !reverse) {
      if (input.method === "creditCard" ? !data.creditCards[input.cardId] : !data.moneyAccounts[input.method === "cash" ? "cash" : input.accountId]) throw new Error("Selecciona la cuenta o tarjeta utilizada.");
      updates[`payments/${p.id}`] = { ...p, amountMinor: input.amountMinor, paidDate: input.date,
        reportingExactDate: input.date, reportingMethod: input.method,
        reportingMoneyAccountId: input.method === "creditCard" ? undefined : input.method === "cash" ? "cash" : input.accountId,
        reportingCardId: input.method === "creditCard" ? input.cardId : undefined,
        reportingClassifiedAt: now, notes: input.notes, ...reviewMeta(user.uid, p) };
      updates[`${group}/${p.sourceId}`] = { ...occurrence, category: input.category, actualAmountMinor: input.amountMinor, ...reviewMeta(user.uid, occurrence) };
      return collapsePatchVersions(data,updates);
    }
    await actions().reopenObligation(p.sourceType, p.sourceId, true);
    // Editing a payment must not reschedule its recurrence or touch a later occurrence.
    for (const path of Object.keys(updates)) {
      if (path.startsWith("nonMonthlyExpenses/") || (path.startsWith("nonMonthlyOccurrences/") && path !== `${group}/${p.sourceId}`)) delete updates[path];
    }
    candidate = applyFinancialUpdates(data, updates);
    const usedSavings = (p.savingsTransactionIds || []).some(id => data.savingsTransactions[id]?.type === "withdrawal");
    if (usedSavings && p.sourceType === "nonMonthly") {
      for (const allocation of Object.values(data.savingsAllocations)) {
        if (allocation.obligationType === "nonMonthly" && allocation.obligationId === p.sourceId && allocation.consumedAt) {
          await capture({ [`savingsAllocations/${allocation.id}`]: { ...allocation, active: true, consumedAt: undefined, releasedAt: undefined, ...reviewMeta(user.uid, allocation) } });
        }
      }
    }
    if (!reverse) {
      const o = candidate[group][p.sourceId];
      await capture({ [`${group}/${p.sourceId}`]: { ...o, category: input.category, ...reviewMeta(user.uid, occurrence) } });
      await actions().payObligation({ sourceType: p.sourceType, sourceId: p.sourceId, amountMinor: input.amountMinor, currency: p.currency,
        paidDate: input.date, method: input.method, cardId: input.cardId, moneyAccountId: input.method === "cash" ? "cash" : input.accountId,
        transferFeeMinor: input.feeMinor, settlementAmountDopMinor: input.settlementMinor, savingsFundId: input.fundId,
        consumeReservedSavings: usedSavings,
        loanPrincipalMinor: input.amountMinor - input.interestMinor - input.chargesMinor,
        loanInterestMinor: input.interestMinor, loanChargesMinor: input.chargesMinor, notes: input.notes });
      for (const path of Object.keys(updates)) {
        if (path.startsWith("nonMonthlyExpenses/") || (path.startsWith("nonMonthlyOccurrences/") && path !== `${group}/${p.sourceId}`)) delete updates[path];
      }
    }
  } else if (target.source === "cardTransaction") {
    const t = data.cardTransactions[target.sourceId];
    if (!t || t.reversedAt) throw new Error("Movimiento no disponible.");
    if (t.linkedPaymentId) return buildMovementEdit(data, user, {source:"payment", sourceId:t.linkedPaymentId}, input, reverse);
    if (t.linkedDailyExpenseId) throw new Error("Edita el gasto extra asociado para conservar su vínculo.");
    if (!reverse && t.linkedPurchaseGoalId && input.currency !== t.currency) throw new Error("Conserva la moneda de la meta vinculada. Cambiarla también requiere revisar su presupuesto y sus apartados.");
    // Temporarily detach the goal while replacing its charge; restore the link atomically below.
    if (t.linkedPurchaseGoalId) await capture({ [`cardTransactions/${t.id}`]: { ...t, linkedPurchaseGoalId: undefined } });
    await actions().reverseCardTransaction(t.id);
    if (!reverse && t.type === "charge" && input.method !== "creditCard") {
      const expense = newExpense({name:input.name, unitPriceCents:input.currency==="USD"?input.settlementMinor:input.amountMinor, quantity:1,
        occurredDate:input.date, category:input.category, currency:"DOP", paymentMethod:input.method==="cash"?"cash":input.method==="debitCard"?"debit":"transfer",
        moneyAccountId:input.method==="cash"?"cash":input.accountId, transferFeeCents:input.feeMinor});
      await capture(await buildExpenseUpdates(candidate,user,expense));
    } else if (!reverse) {
      await actions().addCardTransaction(input.cardId || t.cardId, input.currency, t.type, input.amountMinor, input.date,
        input.name, input.fundId || undefined, input.settlementMinor || undefined, t.affectsCurrentBalance !== false,
        input.method === "cash" ? "cash" : input.accountId, input.method === "creditCard" ? "bankTransfer" : input.method, input.feeMinor, input.category);
    }
    if (t.linkedPurchaseGoalId) {
      const goal = data.purchaseGoals[t.linkedPurchaseGoalId];
      const fresh = Object.entries(updates).find(([path,v]) => path.startsWith("cardTransactions/") && path !== `cardTransactions/${t.id}` && !(v as {reversedAt?:string}).reversedAt);
      const freshExpense = Object.keys(updates).find(path=>path.startsWith("managedExpenses/"))?.split("/")[1];
      if (fresh) updates[fresh[0]] = { ...(fresh[1] as object), linkedPurchaseGoalId: goal.id };
      updates[`purchaseGoals/${goal.id}`] = { ...goal, status: reverse ? "active" : "purchased", currency: input.currency,
        purchasedAt: reverse ? undefined : input.date, actualAmountMinor: reverse ? undefined : input.amountMinor,
        linkedCardTransactionId: fresh?.[0].split("/")[1], linkedDailyExpenseId:freshExpense,
        purchaseMethod:reverse?undefined:input.method, category: input.category, ...reviewMeta(user.uid, goal) };
    }
  } else if (target.source === "savingsTransaction") {
    const t = data.savingsTransactions[target.sourceId];
    if (!t || t.reversedAt) throw new Error("Movimiento no disponible.");
    if (t.linkedPaymentId) return buildMovementEdit(data, user, {source:"payment",sourceId:t.linkedPaymentId}, input, reverse);
    if (t.transferId) throw new Error("Este movimiento pertenece a una transferencia entre fondos. Deben corregirse ambos extremos juntos.");
    await capture({ [`savingsTransactions/${t.id}`]: { ...t, reversedAt: now, ...reviewMeta(user.uid, t) } });
    if (!reverse) await actions().addSavingsTransaction(input.fundId || t.fundId, t.type, input.amountMinor, input.date, input.notes);
  } else {
    const t = data.moneyTransactions[target.sourceId];
    if (!t || t.reversedAt) throw new Error("Movimiento no disponible.");
    if (t.linkedPaymentId) return buildMovementEdit(data,user,{source:"payment",sourceId:t.linkedPaymentId},input,reverse);
    if (t.linkedCardTransactionId) return buildMovementEdit(data,user,{source:"cardTransaction",sourceId:t.linkedCardTransactionId},input,reverse);
    if (t.linkedDailyExpenseId) throw new Error("Edita el gasto extra asociado.");
    if (t.type !== "fee") throw new Error("Este movimiento se corrige desde su operación original.");
    updates[`moneyTransactions/${t.id}`] = { ...t, amountMinor: input.amountMinor, transactionDate: input.date, description: input.name,
      reversedAt: reverse ? now : undefined, ...reviewMeta(user.uid, t) };
  }
  return collapsePatchVersions(data,updates);
}
export function newExpense(input: ExpenseEditableFields): Expense {
  return { ...input, id: createId(), occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "transferred" };
}
