import { useCallback } from "react";
import type { AppUserDefinition } from "../config/appUsers";
import { getMonthKey, getQuincena, toLocalDateKey } from "../lib/date";
import { dateFromFinancialMonthRule, nextOccurrenceDate } from "../lib/financeDates";
import { getCardCurrentDebt, getCardPaymentPlanId, getFundAllocated, getFundBalance, getObligationAllocations, getPurchaseGoalReserved } from "../lib/financialCalculations";
import { buildGenerationUpdates, buildPausedMonthlyOccurrenceUpdates } from "../lib/financialGeneration";
import { createId } from "../lib/id";
import type { Expense } from "../models/expense";
import type {
  AppSettings,
  CardPaymentPlan,
  CardStatement,
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
  PurchaseGoal,
  PurchaseGoalPriority,
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
  plannedQuincena: 1 | 2;
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
  initialBalanceMinor?: number;
  targetAmountMinor?: number;
  targetDate?: string;
  active: boolean;
  notes?: string;
}

export interface PurchaseGoalInput {
  name: string;
  estimatedAmountMinor: number;
  currency: Currency;
  priority: PurchaseGoalPriority;
  category?: string;
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
          quincena: template.plannedQuincena ?? getQuincena(dueDate),
          canPayWithCard: template.canPayWithCard,
          notes: template.notes,
          excelRowLabel: template.excelRowLabel,
          ...meta(occurrence),
        };
      });
    if (!template.active) {
      Object.assign(
        updates,
        buildPausedMonthlyOccurrenceUpdates(data, templateId, getMonthKey(toLocalDateKey())),
      );
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const archiveMonthlyTemplate = useCallback(async (id: string) => {
    const existing = data.monthlyTemplates[id];
    if (!existing) return;
    await commitUpdates({
      [`monthlyTemplates/${id}`]: { ...existing, active: false, ...meta(existing), archivedAt: new Date().toISOString() },
      ...buildPausedMonthlyOccurrenceUpdates(data, id, getMonthKey(toLocalDateKey())),
    });
  }, [commitUpdates, data, meta]);

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
      quincena: input.plannedQuincena,
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
        linkedPurchaseGoalId: input.sourceType === "nonMonthly" && "sourcePurchaseGoalId" in occurrence
          ? occurrence.sourcePurchaseGoalId
          : undefined,
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

    if (input.sourceType === "nonMonthly" && "sourcePurchaseGoalId" in occurrence && occurrence.sourcePurchaseGoalId) {
      const goal = data.purchaseGoals[occurrence.sourcePurchaseGoalId];
      if (goal) {
        updates[`purchaseGoals/${goal.id}`] = {
          ...goal,
          status: "purchased",
          actualAmountMinor: input.amountMinor,
          purchaseMethod: input.method,
          linkedCardTransactionId: cardTransactionId,
          purchasedAt: input.paidDate,
          ...meta(goal),
        };
      }
    }

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
    if (sourceType === "nonMonthly" && "sourcePurchaseGoalId" in occurrence && occurrence.sourcePurchaseGoalId) {
      const goal = data.purchaseGoals[occurrence.sourcePurchaseGoalId];
      if (goal) {
        updates[`purchaseGoals/${goal.id}`] = {
          ...goal,
          status: "scheduled",
          actualAmountMinor: undefined,
          purchaseMethod: undefined,
          linkedCardTransactionId: undefined,
          purchasedAt: undefined,
          ...meta(goal),
        };
      }
    }
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
    const { initialBalanceMinor, ...fundInput } = input;
    const fund: SavingsFund = {
      id: fundId,
      ...fundInput,
      name: input.name.trim(),
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`savingsFunds/${fundId}`]: fund };
    if (!existing && initialBalanceMinor && initialBalanceMinor > 0) {
      const transactionId = createId();
      updates[`savingsTransactions/${transactionId}`] = {
        id: transactionId,
        fundId,
        type: "deposit",
        amountMinor: initialBalanceMinor,
        currency: input.currency,
        transactionDate: toLocalDateKey(),
        notes: "Saldo inicial",
        ...meta(),
      } satisfies SavingsTransaction;
    }
    await commitUpdates(updates);
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
    if (!fund.active && (type === "deposit" || type === "transferIn")) {
      throw new Error("Activa el fondo antes de añadir dinero nuevo.");
    }
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
    if (!to.active) throw new Error("El fondo de destino está inactivo.");
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
    if (!fund.active) throw new Error("El fondo está inactivo.");
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

  const savePurchaseGoal = useCallback(async (input: PurchaseGoalInput, id?: string) => {
    const goalId = id || createId();
    const existing = data.purchaseGoals[goalId];
    if (existing && existing.status !== "active") throw new Error("Solo se pueden editar metas activas.");
    if (existing && existing.currency !== input.currency && getPurchaseGoalReserved(data, goalId) > 0) {
      throw new Error("Libera los ahorros reservados antes de cambiar la moneda.");
    }
    const goal: PurchaseGoal = {
      id: goalId,
      name: input.name.trim(),
      estimatedAmountMinor: input.estimatedAmountMinor,
      currency: input.currency,
      priority: input.priority,
      category: cleanOptional(input.category),
      notes: cleanOptional(input.notes),
      status: existing?.status || "active",
      ...meta(existing),
    };
    await commitUpdates({ [`purchaseGoals/${goalId}`]: goal });
  }, [commitUpdates, data, meta]);

  const allocatePurchaseGoalSavings = useCallback(async (fundId: string, goalId: string, amountMinor: number) => {
    const fund = data.savingsFunds[fundId];
    const goal = data.purchaseGoals[goalId];
    if (!fund?.active || !goal || goal.status !== "active") throw new Error("El fondo o la meta ya no está disponible.");
    if (fund.currency !== goal.currency) throw new Error("El fondo y la meta deben usar la misma moneda.");
    const available = getFundBalance(data, fundId) - getFundAllocated(data, fundId);
    if (amountMinor > available) throw new Error("El monto excede el balance disponible del fondo.");
    const remainingGoal = Math.max(0, goal.estimatedAmountMinor - getPurchaseGoalReserved(data, goalId));
    if (amountMinor > remainingGoal) throw new Error("El monto excede lo que falta para completar la meta.");
    const allocationId = createId();
    const allocation: SavingsAllocation = {
      id: allocationId,
      fundId,
      obligationType: "purchaseGoal",
      obligationId: goalId,
      amountMinor,
      currency: goal.currency,
      active: true,
      ...meta(),
    };
    await commitUpdates({ [`savingsAllocations/${allocationId}`]: allocation });
  }, [commitUpdates, data, meta]);

  const schedulePurchaseGoal = useCallback(async (goalId: string, dueDate: string) => {
    const goal = data.purchaseGoals[goalId];
    if (!goal || goal.status !== "active") throw new Error("La meta ya no está disponible para programar.");
    const planId = createId();
    const occurrenceId = `${planId}_${dueDate}`;
    const plan: NonMonthlyExpense = {
      id: planId,
      name: goal.name,
      category: goal.category,
      estimatedAmountMinor: goal.estimatedAmountMinor,
      currency: goal.currency,
      nextDueDate: dueDate,
      recurrenceKind: "once",
      recurrenceInterval: 1,
      warningMonths: data.settings.nonMonthlyWarningMonths,
      canPayWithCard: true,
      active: true,
      notes: goal.notes,
      sourcePurchaseGoalId: goalId,
      ...meta(),
    };
    const occurrence: NonMonthlyOccurrence = {
      id: occurrenceId,
      planId,
      name: goal.name,
      category: goal.category,
      expectedAmountMinor: goal.estimatedAmountMinor,
      currency: goal.currency,
      dueDate,
      status: "upcoming",
      canPayWithCard: true,
      notes: goal.notes,
      sourcePurchaseGoalId: goalId,
      ...meta(),
    };
    const updates: Record<string, unknown> = {
      [`nonMonthlyExpenses/${planId}`]: plan,
      [`nonMonthlyOccurrences/${occurrenceId}`]: occurrence,
      [`purchaseGoals/${goalId}`]: {
        ...goal,
        status: "scheduled",
        scheduledPlanId: planId,
        scheduledOccurrenceId: occurrenceId,
        ...meta(goal),
      },
    };
    getObligationAllocations(data, "purchaseGoal", goalId).forEach((allocation) => {
      updates[`savingsAllocations/${allocation.id}`] = {
        ...allocation,
        obligationType: "nonMonthly",
        obligationId: occurrenceId,
        ...meta(allocation),
      };
    });
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const purchaseGoalWithCash = useCallback(async (
    goalId: string,
    actualAmountMinor: number,
    actualPaymentDopMinor: number,
    purchaseDate: string,
    linkedDailyExpenseId: string,
  ) => {
    const goal = data.purchaseGoals[goalId];
    if (!goal || goal.status !== "active") throw new Error("La meta ya no está disponible para comprar.");
    if (actualAmountMinor <= 0 || actualPaymentDopMinor <= 0) throw new Error("Escribe montos válidos para la compra.");
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`purchaseGoals/${goalId}`]: {
        ...goal,
        status: "purchased",
        actualAmountMinor,
        actualPaymentDopMinor: goal.currency === "USD" ? actualPaymentDopMinor : undefined,
        purchaseMethod: "cash",
        linkedDailyExpenseId,
        purchasedAt: purchaseDate,
        ...meta(goal),
      },
    };
    let amountLeft = actualAmountMinor;
    for (const allocation of getObligationAllocations(data, "purchaseGoal", goalId)) {
      if (amountLeft <= 0) {
        updates[`savingsAllocations/${allocation.id}`] = {
          ...allocation,
          active: false,
          releasedAt: now,
          ...meta(allocation),
        };
        continue;
      }
      const used = Math.min(allocation.amountMinor, amountLeft);
      const withdrawalId = createId();
      updates[`savingsTransactions/${withdrawalId}`] = {
        id: withdrawalId,
        fundId: allocation.fundId,
        type: "withdrawal",
        amountMinor: used,
        currency: allocation.currency,
        transactionDate: purchaseDate,
        notes: `Compra de ${goal.name}`,
        ...meta(),
      } satisfies SavingsTransaction;
      updates[`savingsAllocations/${allocation.id}`] = {
        ...allocation,
        amountMinor: used,
        active: false,
        consumedAt: now,
        ...meta(allocation),
      };
      if (used < allocation.amountMinor) {
        const releasedId = createId();
        updates[`savingsAllocations/${releasedId}`] = {
          ...allocation,
          id: releasedId,
          amountMinor: allocation.amountMinor - used,
          active: false,
          releasedAt: now,
          ...meta(),
        } satisfies SavingsAllocation;
      }
      amountLeft -= used;
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const purchaseGoalWithCard = useCallback(async (
    goalId: string,
    actualAmountMinor: number,
    purchaseDate: string,
    cardId: string,
  ) => {
    const goal = data.purchaseGoals[goalId];
    const card = data.creditCards[cardId];
    if (!goal || goal.status !== "active") throw new Error("La meta ya no está disponible para comprar.");
    if (!card?.active) throw new Error("Selecciona una tarjeta activa.");
    if (actualAmountMinor <= 0) throw new Error("Escribe un monto válido para la compra.");
    const transactionId = createId();
    const transaction: CardTransaction = {
      id: transactionId,
      cardId,
      currency: goal.currency,
      type: "charge",
      amountMinor: actualAmountMinor,
      transactionDate: purchaseDate,
      description: goal.name,
      linkedPurchaseGoalId: goalId,
      ...meta(),
    };
    const updates: Record<string, unknown> = {
      [`cardTransactions/${transactionId}`]: transaction,
      [`purchaseGoals/${goalId}`]: {
        ...goal,
        status: "purchased",
        actualAmountMinor,
        purchaseMethod: "creditCard",
        linkedCardTransactionId: transactionId,
        purchasedAt: purchaseDate,
        ...meta(goal),
      },
    };
    let coverageLeft = actualAmountMinor;
    const now = new Date().toISOString();
    for (const allocation of getObligationAllocations(data, "purchaseGoal", goalId)) {
      if (coverageLeft <= 0) {
        updates[`savingsAllocations/${allocation.id}`] = { ...allocation, active: false, releasedAt: now, ...meta(allocation) };
        continue;
      }
      const kept = Math.min(allocation.amountMinor, coverageLeft);
      if (kept < allocation.amountMinor) {
        updates[`savingsAllocations/${allocation.id}`] = { ...allocation, amountMinor: kept, ...meta(allocation) };
        const releasedId = createId();
        updates[`savingsAllocations/${releasedId}`] = {
          ...allocation,
          id: releasedId,
          amountMinor: allocation.amountMinor - kept,
          active: false,
          releasedAt: now,
          ...meta(),
        } satisfies SavingsAllocation;
      }
      coverageLeft -= kept;
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const discardPurchaseGoal = useCallback(async (goalId: string) => {
    const goal = data.purchaseGoals[goalId];
    if (!goal || goal.status !== "active") return;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`purchaseGoals/${goalId}`]: { ...goal, status: "discarded", discardedAt: now, ...meta(goal) },
    };
    getObligationAllocations(data, "purchaseGoal", goalId).forEach((allocation) => {
      updates[`savingsAllocations/${allocation.id}`] = {
        ...allocation,
        active: false,
        releasedAt: now,
        ...meta(allocation),
      };
    });
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const saveCardStatementMinimum = useCallback(async (statementId: string, minimumPaymentMinor: number) => {
    const statement = data.cardStatements[statementId];
    if (!statement) throw new Error("Estado de cuenta no encontrado.");
    const minimum = Math.max(0, Math.round(minimumPaymentMinor));
    if (minimum <= 0) {
      const { minimumPaymentMinor: _removed, ...withoutMinimum } = statement;
      const updated: CardStatement = { ...withoutMinimum, ...meta(statement) };
      await commitUpdates({ [`cardStatements/${statementId}`]: updated });
      return;
    }
    await commitUpdates({
      [`cardStatements/${statementId}`]: {
        ...statement,
        minimumPaymentMinor: minimum,
        ...meta(statement),
      } satisfies CardStatement,
    });
  }, [commitUpdates, data.cardStatements, meta]);

  const saveCardPaymentPlan = useCallback(async (
    financialMonth: string,
    quincena: 1 | 2,
    plannedDopMinor: number,
    plannedUsdMinor: number,
  ) => {
    const id = getCardPaymentPlanId(financialMonth, quincena);
    const existing = data.cardPaymentPlans[id];
    const dop = Math.max(0, Math.round(plannedDopMinor));
    const usd = Math.max(0, Math.round(plannedUsdMinor));
    if (dop === 0 && usd === 0) {
      await commitUpdates({ [`cardPaymentPlans/${id}`]: null });
      return;
    }
    const plan: CardPaymentPlan = {
      id,
      financialMonth,
      quincena,
      plannedDopMinor: dop,
      plannedUsdMinor: usd,
      ...meta(existing),
    };
    await commitUpdates({ [`cardPaymentPlans/${id}`]: plan });
  }, [commitUpdates, data.cardPaymentPlans, meta]);

  const syncDailyExpenseCardCharge = useCallback(async (expense: Expense) => {
    const linkedTransactions = Object.values(data.cardTransactions)
      .filter((transaction) => transaction.linkedDailyExpenseId === expense.id
        && transaction.type === "charge"
        && !transaction.reversedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (expense.paymentMethod !== "creditCard") {
      linkedTransactions.forEach((transaction) => {
        updates[`cardTransactions/${transaction.id}`] = {
          ...transaction,
          reversedAt: now,
          ...meta(transaction),
        };
      });
    } else {
      const card = Object.values(data.creditCards).find((item) => item.active && !item.archivedAt);
      if (!card) throw new Error("Configura una tarjeta activa antes de registrar una compra con crédito.");
      const existing = linkedTransactions[0];
      const transactionId = existing?.id || createId();
      const transaction: CardTransaction = {
        ...(existing || {}),
        id: transactionId,
        cardId: card.id,
        currency: expense.currency === "USD" ? "USD" : "DOP",
        type: "charge",
        amountMinor: expense.unitPriceCents * expense.quantity,
        transactionDate: expense.occurredDate,
        description: expense.name,
        linkedDailyExpenseId: expense.id,
        ...meta(existing),
      };
      updates[`cardTransactions/${transactionId}`] = transaction;
      linkedTransactions.slice(1).forEach((duplicate) => {
        updates[`cardTransactions/${duplicate.id}`] = {
          ...duplicate,
          reversedAt: now,
          ...meta(duplicate),
        };
      });
    }

    if (Object.keys(updates).length) await commitUpdates(updates);
  }, [commitUpdates, data.cardTransactions, data.creditCards, meta]);

  const removeDailyExpenseCardCharge = useCallback(async (expenseId: string) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    Object.values(data.cardTransactions)
      .filter((transaction) => transaction.linkedDailyExpenseId === expenseId && !transaction.reversedAt)
      .forEach((transaction) => {
        updates[`cardTransactions/${transaction.id}`] = {
          ...transaction,
          reversedAt: now,
          ...meta(transaction),
        };
      });
    if (Object.keys(updates).length) await commitUpdates(updates);
  }, [commitUpdates, data.cardTransactions, meta]);

  const saveCreditCard = useCallback(async (input: CreditCardInput, id?: string) => {
    const cardId = id || createId();
    const existing = data.creditCards[cardId];
    if (!existing && Object.values(data.creditCards).some((card) => !card.archivedAt)) {
      throw new Error("La aplicación utiliza una sola tarjeta. Edita la tarjeta existente.");
    }
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
    savingsFundId?: string,
    settlementAmountDopMinor?: number,
  ) => {
    const card = data.creditCards[cardId];
    if (!card) throw new Error("Tarjeta no encontrada.");
    if (type === "charge" && !card.active) throw new Error("La tarjeta está inactiva.");
    if (amountMinor <= 0 && type !== "adjustment") throw new Error("El monto debe ser mayor que cero.");
    if (type === "payment") {
      const currentDebt = getCardCurrentDebt(data, cardId, currency);
      if (currentDebt <= 0) throw new Error(`La tarjeta no tiene deuda pendiente en ${currency}.`);
      if (amountMinor > currentDebt) throw new Error("El pago no puede exceder la deuda pendiente. Para corregir el balance, registra un ajuste.");
      if (currency === "USD" && (!settlementAmountDopMinor || settlementAmountDopMinor <= 0)) {
        throw new Error("Escribe el monto real pagado en pesos dominicanos.");
      }
    }
    const id = createId();
    const transaction: CardTransaction = {
      id,
      cardId,
      currency,
      type,
      amountMinor,
      settlementAmountDopMinor: type === "payment" && currency === "USD"
        ? settlementAmountDopMinor
        : undefined,
      transactionDate,
      description: description.trim(),
      ...meta(),
    };
    const updates: Record<string, unknown> = { [`cardTransactions/${id}`]: transaction };
    if (type === "payment" && savingsFundId) {
      const fund = data.savingsFunds[savingsFundId];
      const paymentCurrency: Currency = currency === "USD" ? "DOP" : currency;
      const paymentAmountMinor = currency === "USD"
        ? Math.abs(settlementAmountDopMinor || 0)
        : Math.abs(amountMinor);
      if (!fund?.active || fund.currency !== paymentCurrency) {
        throw new Error(`Selecciona un fondo activo en ${paymentCurrency}.`);
      }
      const coveredCharges = Object.values(data.cardTransactions)
        .filter((item) => item.cardId === cardId
          && item.currency === currency
          && item.type === "charge"
          && !item.reversedAt
          && (item.linkedExpenseId || item.linkedPurchaseGoalId));
      const coveredObligations = new Set(coveredCharges
        .map((item) => item.linkedExpenseId)
        .filter((value): value is string => Boolean(value)));
      const coveredGoals = new Set(coveredCharges
        .map((item) => item.linkedPurchaseGoalId)
        .filter((value): value is string => Boolean(value)));
      const matchingAllocations = fund.currency === currency ? Object.values(data.savingsAllocations)
        .filter((allocation) => allocation.fundId === savingsFundId
          && allocation.currency === currency
          && allocation.active
          && !allocation.releasedAt
          && !allocation.consumedAt
          && ((allocation.obligationType === "nonMonthly" && coveredObligations.has(allocation.obligationId))
            || (allocation.obligationType === "purchaseGoal" && coveredGoals.has(allocation.obligationId))
            || (allocation.obligationType === "cardStatement"
              && data.cardStatements[allocation.obligationId]?.cardId === cardId
              && data.cardStatements[allocation.obligationId]?.currency === currency)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
      const matchingReserved = matchingAllocations.reduce((total, allocation) => total + allocation.amountMinor, 0);
      const unallocated = getFundBalance(data, savingsFundId) - getFundAllocated(data, savingsFundId);
      if (paymentAmountMinor > unallocated + matchingReserved) throw new Error("El fondo no tiene balance disponible o reservado suficiente para esta tarjeta.");
      const withdrawalId = createId();
      updates[`savingsTransactions/${withdrawalId}`] = {
        id: withdrawalId,
        fundId: savingsFundId,
        type: "withdrawal",
        amountMinor: paymentAmountMinor,
        currency: paymentCurrency,
        transactionDate,
        linkedCardTransactionId: id,
        notes: `Pago de ${card.name}`,
        ...meta(),
      } satisfies SavingsTransaction;
      let reservedToRelease = Math.min(paymentAmountMinor, matchingReserved);
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
    if (transaction.linkedDailyExpenseId) throw new Error("Edita o elimina este gasto desde Historial para mantener ambos registros sincronizados.");
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`cardTransactions/${id}`]: { ...transaction, reversedAt: now, ...meta(transaction) },
    };
    if (transaction.linkedPurchaseGoalId) {
      const goal = data.purchaseGoals[transaction.linkedPurchaseGoalId];
      if (goal?.linkedCardTransactionId === transaction.id) {
        updates[`purchaseGoals/${goal.id}`] = {
          ...goal,
          status: "active",
          actualAmountMinor: undefined,
          purchaseMethod: undefined,
          linkedCardTransactionId: undefined,
          purchasedAt: undefined,
          ...meta(goal),
        };
      }
    }
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
  }, [commitUpdates, data.cardTransactions, data.purchaseGoals, data.savingsAllocations, data.savingsTransactions, meta]);

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
    savePurchaseGoal,
    allocatePurchaseGoalSavings,
    schedulePurchaseGoal,
    purchaseGoalWithCash,
    purchaseGoalWithCard,
    discardPurchaseGoal,
    saveCardStatementMinimum,
    saveCardPaymentPlan,
    syncDailyExpenseCardCharge,
    removeDailyExpenseCardCharge,
    saveCreditCard,
    addCardTransaction,
    reverseCardTransaction,
    updateSettings,
  };
};
