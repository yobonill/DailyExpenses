import { useCallback } from "react";
import type { AppUserDefinition } from "../config/appUsers";
import { getMonthKey, getQuincena } from "../lib/date";
import { dateFromFinancialMonthRule, nextOccurrenceDate } from "../lib/financeDates";
import { getFundAllocated, getFundBalance, getObligationAllocations } from "../lib/financialCalculations";
import { buildGenerationUpdates } from "../lib/financialGeneration";
import { createId } from "../lib/id";
import type {
  AppSettings,
  CardTransaction,
  CreditCard,
  Currency,
  DueDateRule,
  FinancialData,
  IncomeOccurrence,
  IncomeTemplate,
  MonthlyExpenseOccurrence,
  MonthlyExpenseTemplate,
  NonMonthlyExpense,
  NonMonthlyOccurrence,
  Payment,
  PaymentMethod,
  RecordMetadata,
  SavingsAllocation,
  SavingsFund,
  SavingsTransaction,
} from "../models/finance";

interface ActionDependencies {
  data: FinancialData;
  user: AppUserDefinition;
  commitUpdates: (updates: Record<string, unknown>) => Promise<void>;
}

const cleanOptional = (value: string | undefined): string | undefined => value?.trim() || undefined;

export interface MonthlyTemplateInput {
  name: string;
  category?: string;
  estimatedAmountMinor: number;
  currency: Currency;
  dueRule: DueDateRule;
  variableAmount: boolean;
  canPayWithCard: boolean;
  active: boolean;
  notes?: string;
  excelRowLabel?: string;
}

export interface OneTimeMonthlyInput extends MonthlyTemplateInput {
  dueDate: string;
}

export interface IncomeTemplateInput {
  name: string;
  incomeType: "salary" | "recurringOther";
  expectedAmountMinor: number;
  currency: Currency;
  dueRule: DueDateRule;
  active: boolean;
  notes?: string;
  excelRowLabel?: string;
  exportExpectedWhenPending: boolean;
}

export interface OneTimeIncomeInput {
  name: string;
  expectedAmountMinor: number;
  currency: Currency;
  expectedDate: string;
  notes?: string;
  excelRowLabel?: string;
  exportExpectedWhenPending: boolean;
}

export interface NonMonthlyInput {
  name: string;
  category?: string;
  estimatedAmountMinor: number;
  currency: Currency;
  nextDueDate: string;
  recurrenceKind: "once" | "months" | "years";
  recurrenceInterval: number;
  warningMonths: number;
  canPayWithCard: boolean;
  active: boolean;
  notes?: string;
}

export interface CreditCardInput {
  name: string;
  bank?: string;
  lastFour?: string;
  cutDay: number;
  dueDay: number;
  active: boolean;
  openingCurrentDebtDopMinor: number;
  openingCurrentDebtUsdMinor: number;
  openingStatementDopMinor: number;
  openingStatementUsdMinor: number;
  creditLimitDopMinor?: number;
  creditLimitUsdMinor?: number;
  openingDate: string;
  notes?: string;
}

export interface SavingsFundInput {
  name: string;
  currency: Currency;
  targetAmountMinor?: number;
  targetDate?: string;
  active: boolean;
  notes?: string;
}

export interface PayObligationInput {
  sourceType: "monthly" | "nonMonthly";
  sourceId: string;
  amountMinor: number;
  currency: Currency;
  paidDate: string;
  method: PaymentMethod;
  cardId?: string;
  consumeReservedSavings?: boolean;
  notes?: string;
}

export const useFinanceActions = ({ data, user, commitUpdates }: ActionDependencies) => {
  const actor = user.uid;

  const meta = useCallback((existing?: RecordMetadata): RecordMetadata => {
    const now = new Date().toISOString();
    return {
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || actor,
      updatedAt: now,
      updatedBy: actor,
      version: (existing?.version || 0) + 1,
      archivedAt: existing?.archivedAt,
    };
  }, [actor]);

  const generateRecurring = useCallback(async () => {
    const updates = buildGenerationUpdates(data, actor);
    if (Object.keys(updates).length) await commitUpdates(updates);
  }, [actor, commitUpdates, data]);

  const saveMonthlyTemplate = useCallback(async (input: MonthlyTemplateInput, id?: string) => {
    const templateId = id || createId();
    const existing = data.monthlyTemplates[templateId];
    const template: MonthlyExpenseTemplate = {
      id: templateId,
      ...input,
      name: input.name.trim(),
      category: cleanOptional(input.category),
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`monthlyTemplates/${templateId}`]: template };
    Object.values(data.monthlyOccurrences)
      .filter((occurrence) => occurrence.templateId === templateId && occurrence.status === "upcoming")
      .forEach((occurrence) => {
        const dueDate = dateFromFinancialMonthRule(occurrence.financialMonth, template.dueRule);
        updates[`monthlyOccurrences/${occurrence.id}`] = {
          ...occurrence,
          name: template.name,
          category: template.category,
          expectedAmountMinor: template.estimatedAmountMinor,
          currency: template.currency,
          dueDate,
          quincena: getQuincena(dueDate),
          canPayWithCard: template.canPayWithCard,
          notes: template.notes,
          excelRowLabel: template.excelRowLabel,
          ...meta(occurrence),
        };
      });
    await commitUpdates(updates);
  }, [commitUpdates, data.monthlyOccurrences, data.monthlyTemplates, meta]);

  const archiveMonthlyTemplate = useCallback(async (id: string) => {
    const existing = data.monthlyTemplates[id];
    if (!existing) return;
    await commitUpdates({
      [`monthlyTemplates/${id}`]: { ...existing, active: false, ...meta(existing), archivedAt: new Date().toISOString() },
    });
  }, [commitUpdates, data.monthlyTemplates, meta]);

  const createOneTimeMonthly = useCallback(async (input: OneTimeMonthlyInput) => {
    const id = createId();
    const occurrence: MonthlyExpenseOccurrence = {
      id,
      name: input.name.trim(),
      category: cleanOptional(input.category),
      expectedAmountMinor: input.estimatedAmountMinor,
      currency: input.currency,
      dueDate: input.dueDate,
      financialMonth: getMonthKey(input.dueDate),
      quincena: getQuincena(input.dueDate),
      status: "upcoming",
      canPayWithCard: input.canPayWithCard,
      oneTime: true,
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      ...meta(),
    };
    await commitUpdates({ [`monthlyOccurrences/${id}`]: occurrence });
  }, [commitUpdates, meta]);

  const cancelMonthlyOccurrence = useCallback(async (id: string, reason?: string) => {
    const occurrence = data.monthlyOccurrences[id];
    if (!occurrence) return;
    await commitUpdates({
      [`monthlyOccurrences/${id}`]: {
        ...occurrence,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledReason: cleanOptional(reason),
        ...meta(occurrence),
      },
    });
  }, [commitUpdates, data.monthlyOccurrences, meta]);

  const payObligation = useCallback(async (input: PayObligationInput) => {
    const occurrence = input.sourceType === "monthly"
      ? data.monthlyOccurrences[input.sourceId]
      : data.nonMonthlyOccurrences[input.sourceId];
    if (!occurrence || occurrence.status !== "upcoming") throw new Error("Esta obligación ya no está pendiente.");
    if (occurrence.currency !== input.currency) throw new Error("La moneda no coincide con la obligación.");
    if (input.method === "creditCard") {
      const card = input.cardId ? data.creditCards[input.cardId] : undefined;
      if (!card?.active) throw new Error("Selecciona una tarjeta activa.");
      if (!occurrence.canPayWithCard) throw new Error("Esta obligación no admite pago con tarjeta.");
    }

    const now = new Date().toISOString();
    const paymentId = createId();
    const cardTransactionId = input.method === "creditCard" ? createId() : undefined;
    const payment: Payment = {
      id: paymentId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paidDate: input.paidDate,
      method: input.method,
      cardId: input.cardId,
      cardTransactionId,
      notes: cleanOptional(input.notes),
      ...meta(),
    };
    const updates: Record<string, unknown> = { [`payments/${paymentId}`]: payment };

    if (input.method === "creditCard" && cardTransactionId && input.cardId) {
      const transaction: CardTransaction = {
        id: cardTransactionId,
        cardId: input.cardId,
        currency: input.currency,
        type: "charge",
        amountMinor: input.amountMinor,
        transactionDate: input.paidDate,
        description: occurrence.name,
        linkedPaymentId: paymentId,
        linkedExpenseId: input.sourceId,
        notes: cleanOptional(input.notes),
        ...meta(),
      };
      updates[`cardTransactions/${cardTransactionId}`] = transaction;
    }

    const updatedOccurrence = {
      ...occurrence,
      status: "paid" as const,
      actualAmountMinor: input.amountMinor,
      paymentId,
      completedAt: input.sourceType === "nonMonthly" ? now : undefined,
      ...meta(occurrence),
    };
    const occurrencePath = input.sourceType === "monthly" ? "monthlyOccurrences" : "nonMonthlyOccurrences";
    updates[`${occurrencePath}/${input.sourceId}`] = updatedOccurrence;

    const savingsTransactionIds: string[] = [];
    if (input.sourceType === "nonMonthly" && input.method === "cash" && input.consumeReservedSavings) {
      let amountLeft = input.amountMinor;
      for (const allocation of getObligationAllocations(data, "nonMonthly", input.sourceId)) {
        if (amountLeft <= 0) break;
        const used = Math.min(allocation.amountMinor, amountLeft);
        const transactionId = createId();
        savingsTransactionIds.push(transactionId);
        const transaction: SavingsTransaction = {
          id: transactionId,
          fundId: allocation.fundId,
          type: "withdrawal",
          amountMinor: used,
          currency: allocation.currency,
          transactionDate: input.paidDate,
          linkedPaymentId: paymentId,
          notes: `Pago de ${occurrence.name}`,
          ...meta(),
        };
        updates[`savingsTransactions/${transactionId}`] = transaction;
        updates[`savingsAllocations/${allocation.id}`] = {
          ...allocation,
          active: false,
          consumedAt: now,
          ...meta(allocation),
        };
        amountLeft -= used;
      }
      payment.savingsTransactionIds = savingsTransactionIds;
      updates[`payments/${paymentId}`] = payment;
    }

    if (input.sourceType === "nonMonthly") {
      const plan = data.nonMonthlyExpenses[(occurrence as { planId: string }).planId];
      if (plan) {
        const nextDue = nextOccurrenceDate(plan.nextDueDate, plan.recurrenceKind, plan.recurrenceInterval);
        updates[`nonMonthlyExpenses/${plan.id}`] = nextDue
          ? { ...plan, nextDueDate: nextDue, ...meta(plan) }
          : { ...plan, ...meta(plan), active: false, archivedAt: now };
      }
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const reopenObligation = useCallback(async (sourceType: "monthly" | "nonMonthly", sourceId: string) => {
    const occurrence = sourceType === "monthly" ? data.monthlyOccurrences[sourceId] : data.nonMonthlyOccurrences[sourceId];
    if (!occurrence?.paymentId) return;
    const payment = data.payments[occurrence.paymentId];
    if (!payment) return;
    const now = new Date().toISOString();
    const occurrencePath = sourceType === "monthly" ? "monthlyOccurrences" : "nonMonthlyOccurrences";
    const updates: Record<string, unknown> = {
      [`${occurrencePath}/${sourceId}`]: {
        ...occurrence,
        status: "upcoming",
        actualAmountMinor: null,
        paymentId: null,
        completedAt: null,
        ...meta(occurrence),
      },
      [`payments/${payment.id}`]: { ...payment, reversedAt: now, ...meta(payment) },
    };
    if (payment.cardTransactionId && data.cardTransactions[payment.cardTransactionId]) {
      const cardTransaction = data.cardTransactions[payment.cardTransactionId];
      updates[`cardTransactions/${cardTransaction.id}`] = { ...cardTransaction, reversedAt: now, ...meta(cardTransaction) };
    }
    for (const transactionId of payment.savingsTransactionIds || []) {
      const transaction = data.savingsTransactions[transactionId];
      if (transaction) updates[`savingsTransactions/${transactionId}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
    }
    if (sourceType === "nonMonthly" && "planId" in occurrence) {
      const plan = data.nonMonthlyExpenses[occurrence.planId];
      if (plan) {
        const generatedNext = data.nonMonthlyOccurrences[`${plan.id}_${plan.nextDueDate}`];
        if (generatedNext && generatedNext.id !== occurrence.id && generatedNext.status === "upcoming") {
          const hasAllocation = Object.values(data.savingsAllocations)
            .some((allocation) => allocation.active && allocation.obligationId === generatedNext.id);
          if (hasAllocation) throw new Error("Libera las asignaciones del siguiente vencimiento antes de reabrir este pago.");
          updates[`nonMonthlyOccurrences/${generatedNext.id}`] = null;
        }
        updates[`nonMonthlyExpenses/${plan.id}`] = { ...plan, ...meta(plan), active: true, archivedAt: null, nextDueDate: occurrence.dueDate };
      }
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const saveIncomeTemplate = useCallback(async (input: IncomeTemplateInput, id?: string) => {
    const templateId = id || createId();
    const existing = data.incomeTemplates[templateId];
    const template: IncomeTemplate = {
      id: templateId,
      ...input,
      name: input.name.trim(),
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`incomeTemplates/${templateId}`]: template };
    Object.values(data.incomeOccurrences)
      .filter((occurrence) => occurrence.templateId === templateId && occurrence.status === "expected")
      .forEach((occurrence) => {
        const expectedDate = dateFromFinancialMonthRule(occurrence.financialMonth, template.dueRule);
        const updatedOccurrence = {
          ...occurrence,
          id: `${templateId}_${expectedDate}`,
          name: template.name,
          expectedAmountMinor: template.expectedAmountMinor,
          currency: template.currency,
          expectedDate,
          quincena: getQuincena(expectedDate),
          notes: template.notes,
          excelRowLabel: template.excelRowLabel,
          exportExpectedWhenPending: template.exportExpectedWhenPending,
          ...meta(occurrence),
        };
        if (updatedOccurrence.id !== occurrence.id) updates[`incomeOccurrences/${occurrence.id}`] = null;
        updates[`incomeOccurrences/${updatedOccurrence.id}`] = updatedOccurrence;
      });
    await commitUpdates(updates);
  }, [commitUpdates, data.incomeOccurrences, data.incomeTemplates, meta]);

  const createOneTimeIncome = useCallback(async (input: OneTimeIncomeInput) => {
    const id = createId();
    const occurrence: IncomeOccurrence = {
      id,
      name: input.name.trim(),
      incomeType: "oneTime",
      expectedAmountMinor: input.expectedAmountMinor,
      currency: input.currency,
      expectedDate: input.expectedDate,
      financialMonth: getMonthKey(input.expectedDate),
      quincena: getQuincena(input.expectedDate),
      status: "expected",
      oneTime: true,
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      exportExpectedWhenPending: input.exportExpectedWhenPending,
      ...meta(),
    };
    await commitUpdates({ [`incomeOccurrences/${id}`]: occurrence });
  }, [commitUpdates, meta]);

  const receiveIncome = useCallback(async (id: string, amountMinor: number, receivedDate: string) => {
    const occurrence = data.incomeOccurrences[id];
    if (!occurrence) return;
    await commitUpdates({
      [`incomeOccurrences/${id}`]: {
        ...occurrence,
        status: "received",
        actualAmountMinor: amountMinor,
        receivedDate,
        ...meta(occurrence),
      },
    });
  }, [commitUpdates, data.incomeOccurrences, meta]);

  const reopenIncome = useCallback(async (id: string) => {
    const occurrence = data.incomeOccurrences[id];
    if (!occurrence) return;
    await commitUpdates({
      [`incomeOccurrences/${id}`]: {
        ...occurrence,
        status: "expected",
        actualAmountMinor: null,
        receivedDate: null,
        ...meta(occurrence),
      },
    });
  }, [commitUpdates, data.incomeOccurrences, meta]);

  const saveNonMonthly = useCallback(async (input: NonMonthlyInput, id?: string) => {
    const planId = id || createId();
    const existing = data.nonMonthlyExpenses[planId];
    if (existing && existing.currency !== input.currency) {
      const pendingIds = new Set(Object.values(data.nonMonthlyOccurrences)
        .filter((occurrence) => occurrence.planId === planId && occurrence.status === "upcoming")
        .map((occurrence) => occurrence.id));
      const hasAllocations = Object.values(data.savingsAllocations)
        .some((allocation) => allocation.active && pendingIds.has(allocation.obligationId));
      if (hasAllocations) throw new Error("Libera las asignaciones activas antes de cambiar la moneda.");
    }
    const plan: NonMonthlyExpense = {
      id: planId,
      ...input,
      name: input.name.trim(),
      category: cleanOptional(input.category),
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`nonMonthlyExpenses/${planId}`]: plan };
    const pending = Object.values(data.nonMonthlyOccurrences)
      .filter((occurrence) => occurrence.planId === planId && occurrence.status === "upcoming")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (pending) {
      const occurrenceId = `${planId}_${input.nextDueDate}`;
      const updatedOccurrence: NonMonthlyOccurrence = {
        ...pending,
        id: occurrenceId,
        name: plan.name,
        category: plan.category,
        expectedAmountMinor: plan.estimatedAmountMinor,
        currency: plan.currency,
        dueDate: plan.nextDueDate,
        canPayWithCard: plan.canPayWithCard,
        notes: plan.notes,
        ...meta(pending),
      };
      if (pending.id !== occurrenceId) updates[`nonMonthlyOccurrences/${pending.id}`] = null;
      updates[`nonMonthlyOccurrences/${occurrenceId}`] = updatedOccurrence;
      Object.values(data.savingsAllocations)
        .filter((allocation) => allocation.obligationType === "nonMonthly" && allocation.obligationId === pending.id && allocation.active)
        .forEach((allocation) => {
          updates[`savingsAllocations/${allocation.id}`] = { ...allocation, obligationId: occurrenceId, ...meta(allocation) };
        });
    }
    await commitUpdates(updates);
  }, [commitUpdates, data.nonMonthlyExpenses, data.nonMonthlyOccurrences, data.savingsAllocations, meta]);

  const saveSavingsFund = useCallback(async (input: SavingsFundInput, id?: string) => {
    const fundId = id || createId();
    const existing = data.savingsFunds[fundId];
    if (existing && existing.currency !== input.currency) {
      const hasHistory = Object.values(data.savingsTransactions).some((transaction) => transaction.fundId === fundId)
        || Object.values(data.savingsAllocations).some((allocation) => allocation.fundId === fundId);
      if (hasHistory) throw new Error("No se puede cambiar la moneda de un fondo con movimientos o asignaciones.");
    }
    const fund: SavingsFund = {
      id: fundId,
      ...input,
      name: input.name.trim(),
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    await commitUpdates({ [`savingsFunds/${fundId}`]: fund });
  }, [commitUpdates, data.savingsAllocations, data.savingsFunds, data.savingsTransactions, meta]);

  const addSavingsTransaction = useCallback(async (
    fundId: string,
    type: SavingsTransaction["type"],
    amountMinor: number,
    transactionDate: string,
    notes?: string,
  ) => {
    const fund = data.savingsFunds[fundId];
    if (!fund) throw new Error("Fondo no encontrado.");
    if ((type === "withdrawal" || type === "transferOut") && amountMinor > getFundBalance(data, fundId) - getFundAllocated(data, fundId)) {
      throw new Error("El monto excede el balance no asignado del fondo.");
    }
    const id = createId();
    const transaction: SavingsTransaction = {
      id,
      fundId,
      type,
      amountMinor,
      currency: fund.currency,
      transactionDate,
      notes: cleanOptional(notes),
      ...meta(),
    };
    await commitUpdates({ [`savingsTransactions/${id}`]: transaction });
  }, [commitUpdates, data, meta]);

  const transferSavings = useCallback(async (fromFundId: string, toFundId: string, amountMinor: number, date: string) => {
    const from = data.savingsFunds[fromFundId];
    const to = data.savingsFunds[toFundId];
    if (!from || !to || from.currency !== to.currency) throw new Error("Los fondos deben existir y usar la misma moneda.");
    if (amountMinor > getFundBalance(data, fromFundId) - getFundAllocated(data, fromFundId)) throw new Error("El monto excede el balance no asignado.");
    const transferId = createId();
    const outId = createId();
    const inId = createId();
    const base = { currency: from.currency, transactionDate: date, transferId, notes: `Transferencia a ${to.name}` };
    await commitUpdates({
      [`savingsTransactions/${outId}`]: { id: outId, fundId: fromFundId, type: "transferOut", amountMinor, ...base, ...meta() },
      [`savingsTransactions/${inId}`]: { id: inId, fundId: toFundId, type: "transferIn", amountMinor, ...base, notes: `Transferencia desde ${from.name}`, ...meta() },
    });
  }, [commitUpdates, data, meta]);

  const allocateSavings = useCallback(async (fundId: string, occurrenceId: string, amountMinor: number) => {
    const fund = data.savingsFunds[fundId];
    const occurrence = data.nonMonthlyOccurrences[occurrenceId];
    if (!fund || !occurrence) throw new Error("Fondo u obligación no disponible.");
    if (fund.currency !== occurrence.currency) throw new Error("El fondo y la obligación deben usar la misma moneda.");
    const available = getFundBalance(data, fundId) - getFundAllocated(data, fundId);
    if (amountMinor > available) throw new Error("La asignación excede el balance no asignado del fondo.");
    const id = createId();
    const allocation: SavingsAllocation = {
      id,
      fundId,
      obligationType: "nonMonthly",
      obligationId: occurrenceId,
      amountMinor,
      currency: fund.currency,
      active: true,
      ...meta(),
    };
    await commitUpdates({ [`savingsAllocations/${id}`]: allocation });
  }, [commitUpdates, data, meta]);

  const releaseAllocation = useCallback(async (id: string) => {
    const allocation = data.savingsAllocations[id];
    if (!allocation) return;
    await commitUpdates({
      [`savingsAllocations/${id}`]: {
        ...allocation,
        active: false,
        releasedAt: new Date().toISOString(),
        ...meta(allocation),
      },
    });
  }, [commitUpdates, data.savingsAllocations, meta]);

  const saveCreditCard = useCallback(async (input: CreditCardInput, id?: string) => {
    const cardId = id || createId();
    const existing = data.creditCards[cardId];
    if (existing) {
      const hasLedger = Object.values(data.cardTransactions).some((transaction) => transaction.cardId === cardId)
        || Object.values(data.cardStatements).some((statement) => statement.cardId === cardId);
      const changedLedgerBasis = existing.cutDay !== input.cutDay
        || existing.dueDay !== input.dueDay
        || existing.openingDate !== input.openingDate
        || existing.openingCurrentDebtDopMinor !== input.openingCurrentDebtDopMinor
        || existing.openingCurrentDebtUsdMinor !== input.openingCurrentDebtUsdMinor
        || existing.openingStatementDopMinor !== input.openingStatementDopMinor
        || existing.openingStatementUsdMinor !== input.openingStatementUsdMinor;
      if (hasLedger && changedLedgerBasis) throw new Error("Las fechas y balances iniciales no se pueden cambiar después de crear movimientos o estados.");
    }
    const card: CreditCard = {
      id: cardId,
      ...input,
      name: input.name.trim(),
      bank: cleanOptional(input.bank),
      lastFour: cleanOptional(input.lastFour)?.slice(-4),
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    await commitUpdates({ [`creditCards/${cardId}`]: card });
  }, [commitUpdates, data.cardStatements, data.cardTransactions, data.creditCards, meta]);

  const addCardTransaction = useCallback(async (
    cardId: string,
    currency: Currency,
    type: CardTransaction["type"],
    amountMinor: number,
    transactionDate: string,
    description: string,
    linkedDailyExpenseId?: string,
    savingsFundId?: string,
  ) => {
    const card = data.creditCards[cardId];
    if (!card) throw new Error("Tarjeta no encontrada.");
    if (type === "charge" && !card.active) throw new Error("La tarjeta está inactiva.");
    const id = createId();
    const transaction: CardTransaction = {
      id,
      cardId,
      currency,
      type,
      amountMinor,
      transactionDate,
      description: description.trim(),
      linkedDailyExpenseId,
      ...meta(),
    };
    const updates: Record<string, unknown> = { [`cardTransactions/${id}`]: transaction };
    if (type === "payment" && savingsFundId) {
      const fund = data.savingsFunds[savingsFundId];
      if (!fund?.active || fund.currency !== currency) throw new Error("Selecciona un fondo activo en la misma moneda.");
      const coveredObligations = new Set(Object.values(data.cardTransactions)
        .filter((item) => item.cardId === cardId
          && item.currency === currency
          && item.type === "charge"
          && !item.reversedAt
          && item.linkedExpenseId)
        .map((item) => item.linkedExpenseId as string));
      const matchingAllocations = Object.values(data.savingsAllocations)
        .filter((allocation) => allocation.fundId === savingsFundId
          && allocation.currency === currency
          && allocation.active
          && !allocation.releasedAt
          && !allocation.consumedAt
          && ((allocation.obligationType === "nonMonthly" && coveredObligations.has(allocation.obligationId))
            || (allocation.obligationType === "cardStatement"
              && data.cardStatements[allocation.obligationId]?.cardId === cardId
              && data.cardStatements[allocation.obligationId]?.currency === currency)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const matchingReserved = matchingAllocations.reduce((total, allocation) => total + allocation.amountMinor, 0);
      const unallocated = getFundBalance(data, savingsFundId) - getFundAllocated(data, savingsFundId);
      if (amountMinor > unallocated + matchingReserved) throw new Error("El fondo no tiene balance disponible o reservado suficiente para esta tarjeta.");
      const withdrawalId = createId();
      updates[`savingsTransactions/${withdrawalId}`] = {
        id: withdrawalId,
        fundId: savingsFundId,
        type: "withdrawal",
        amountMinor: Math.abs(amountMinor),
        currency,
        transactionDate,
        linkedCardTransactionId: id,
        notes: `Pago de ${card.name}`,
        ...meta(),
      } satisfies SavingsTransaction;
      let reservedToRelease = Math.min(Math.abs(amountMinor), matchingReserved);
      const now = new Date().toISOString();
      for (const allocation of matchingAllocations) {
        if (reservedToRelease <= 0) break;
        const consumed = Math.min(allocation.amountMinor, reservedToRelease);
        if (consumed === allocation.amountMinor) {
          updates[`savingsAllocations/${allocation.id}`] = { ...allocation, ...meta(allocation), active: false, consumedAt: now, linkedCardTransactionId: id };
        } else {
          updates[`savingsAllocations/${allocation.id}`] = { ...allocation, amountMinor: allocation.amountMinor - consumed, ...meta(allocation) };
          const consumedId = createId();
          updates[`savingsAllocations/${consumedId}`] = {
            ...allocation,
            id: consumedId,
            amountMinor: consumed,
            active: false,
            consumedAt: now,
            linkedCardTransactionId: id,
            ...meta(),
          } satisfies SavingsAllocation;
        }
        reservedToRelease -= consumed;
      }
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const reverseCardTransaction = useCallback(async (id: string) => {
    const transaction = data.cardTransactions[id];
    if (!transaction || transaction.reversedAt) return;
    if (transaction.linkedPaymentId) throw new Error("Reabre la obligación vinculada para revertir este cargo.");
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`cardTransactions/${id}`]: { ...transaction, reversedAt: now, ...meta(transaction) },
    };
    Object.values(data.savingsTransactions)
      .filter((item) => item.linkedCardTransactionId === id && !item.reversedAt)
      .forEach((item) => { updates[`savingsTransactions/${item.id}`] = { ...item, reversedAt: now, ...meta(item) }; });
    Object.values(data.savingsAllocations)
      .filter((allocation) => allocation.linkedCardTransactionId === id)
      .forEach((allocation) => {
        updates[`savingsAllocations/${allocation.id}`] = {
          ...allocation,
          active: true,
          consumedAt: null,
          linkedCardTransactionId: null,
          ...meta(allocation),
        };
      });
    await commitUpdates(updates);
  }, [commitUpdates, data.cardTransactions, data.savingsAllocations, data.savingsTransactions, meta]);

  const updateSettings = useCallback(async (settings: AppSettings) => {
    await commitUpdates({ settings: { ...settings, updatedAt: new Date().toISOString(), updatedBy: actor } });
  }, [actor, commitUpdates]);

  return {
    generateRecurring,
    saveMonthlyTemplate,
    archiveMonthlyTemplate,
    createOneTimeMonthly,
    cancelMonthlyOccurrence,
    payObligation,
    reopenObligation,
    saveIncomeTemplate,
    createOneTimeIncome,
    receiveIncome,
    reopenIncome,
    saveNonMonthly,
    saveSavingsFund,
    addSavingsTransaction,
    transferSavings,
    allocateSavings,
    releaseAllocation,
    saveCreditCard,
    addCardTransaction,
    reverseCardTransaction,
    updateSettings,
  };
};
