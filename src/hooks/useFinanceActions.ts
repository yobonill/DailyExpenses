import { useCallback } from "react";
import type { AppUserDefinition } from "../config/appUsers";
import { getMonthKey, getQuincena, toLocalDateKey } from "../lib/date";
import { dateFromFinancialMonthRule, nextOccurrenceDate } from "../lib/financeDates";
import { getCardCurrentDebt, getCardPaymentPlanId, getFundAllocated, getFundBalance, getObligationAllocations, getPurchaseGoalReserved, getSavingsTransactionEffect } from "../lib/financialCalculations";
import { buildGenerationUpdates, buildPausedMonthlyOccurrenceUpdates } from "../lib/financialGeneration";
import { buildStartingPointReconciliationUpdates, type StartingPointReconciliationInput } from "../lib/startingPointReconciliation";
import { createId } from "../lib/id";
import { BANK_ACCOUNT_ID, CASH_ACCOUNT_ID, LEGACY_BANK_ACCOUNT_ID, getAccountReservedSavings, getLegacyBankBalance, getMoneyAccountBalance, getMoneyAccountSpendableBalance, hasInitializedMoneyAccounts, hasUnifiedSavingsAccounts, isSelectableMoneyAccount } from "../lib/moneyLedger";
import { getLoanBalance } from "../lib/loanLedger";
import { buildPostponedMonthlyOccurrence, buildPostponedNonMonthlyOccurrence } from "../lib/obligationPostponement";
import { buildSavingsAccountReconciliationUpdates, type SavingsAccountReconciliationInput } from "../lib/savingsAccountReconciliation";
import type { Expense } from "../models/expense";
import type {
  AppSettings,
  Bank,
  BankAccountType,
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
  MoneyAccount,
  MoneyAccountId,
  MoneyTransaction,
  NonMonthlyExpense,
  NonMonthlyOccurrence,
  Payment,
  PaymentMethod,
  PurchaseGoal,
  PurchaseGoalPriority,
  RecordMetadata,
  Loan,
  LoanTransaction,
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
  category: string;
  estimatedAmountMinor: number;
  currency: Currency;
  dueRule: DueDateRule;
  plannedQuincena: 1 | 2;
  variableAmount: boolean;
  canPayWithCard: boolean;
  active: boolean;
  notes?: string;
  excelRowLabel?: string;
  loanId?: string;
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
  category: string;
  estimatedAmountMinor: number;
  currency: Currency;
  nextDueDate: string;
  recurrenceKind: "once" | "months" | "years";
  recurrenceInterval: number;
  warningMonths: number;
  canPayWithCard: boolean;
  active: boolean;
  notes?: string;
  loanId?: string;
}

export interface CreditCardInput {
  name: string;
  bank?: string;
  bankId?: string;
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
  moneyAccountId?: MoneyAccountId;
  notes?: string;
}

export interface PurchaseGoalInput {
  name: string;
  estimatedAmountMinor: number;
  currency: Currency;
  priority: PurchaseGoalPriority;
  category: string;
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
  moneyAccountId?: MoneyAccountId;
  transferFeeMinor?: number;
  settlementAmountDopMinor?: number;
  loanPrincipalMinor?: number;
  loanInterestMinor?: number;
  loanChargesMinor?: number;
  consumeReservedSavings?: boolean;
  savingsFundId?: string;
  notes?: string;
}

export interface MoneyAccountsSetupInput {
  openingDate: string;
  bankBalanceMinor: number;
  cashBalanceMinor: number;
}

export interface BankInput {
  name: string;
  active: boolean;
  notes?: string;
}

export interface MoneyAccountInput {
  bankId: string;
  name: string;
  accountType: BankAccountType;
  currency: Currency;
  lastFour?: string;
  openingBalanceMinor: number;
  openingDate: string;
  active: boolean;
  notes?: string;
}

export interface LoanInput {
  name: string;
  lender?: string;
  bankId?: string;
  currency: Currency;
  openingBalanceMinor: number;
  openingDate: string;
  annualInterestRate: number;
  active: boolean;
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
    if (!input.category.trim()) throw new Error("Selecciona una categoría.");
    if (input.loanId) {
      const loan = data.loans[input.loanId];
      if (!loan || loan.archivedAt) throw new Error("Selecciona un préstamo vigente.");
      if (loan.currency !== input.currency) throw new Error("La moneda del gasto debe coincidir con la del préstamo.");
    }
    const templateId = id || createId();
    const existing = data.monthlyTemplates[templateId];
    const template: MonthlyExpenseTemplate = {
      id: templateId,
      ...input,
      name: input.name.trim(),
      category: input.category.trim(),
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      loanId: cleanOptional(input.loanId),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`monthlyTemplates/${templateId}`]: template };
    Object.values(data.monthlyOccurrences)
      .filter((occurrence) => occurrence.templateId === templateId && occurrence.status === "upcoming")
      .forEach((occurrence) => {
        const dueDate = occurrence.postponedAt
          ? occurrence.dueDate
          : dateFromFinancialMonthRule(occurrence.financialMonth, template.dueRule);
        updates[`monthlyOccurrences/${occurrence.id}`] = {
          ...occurrence,
          name: template.name,
          category: template.category,
          expectedAmountMinor: template.estimatedAmountMinor,
          currency: template.currency,
          dueDate,
          financialMonth: occurrence.postponedAt ? occurrence.financialMonth : getMonthKey(dueDate),
          quincena: occurrence.postponedAt ? occurrence.quincena : template.plannedQuincena ?? getQuincena(dueDate),
          canPayWithCard: template.canPayWithCard,
          notes: template.notes,
          excelRowLabel: template.excelRowLabel,
          loanId: template.loanId,
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
    if (!input.category.trim()) throw new Error("Selecciona una categoría.");
    if (input.loanId) {
      const loan = data.loans[input.loanId];
      if (!loan || loan.archivedAt || loan.currency !== input.currency) throw new Error("Revisa el préstamo relacionado y su moneda.");
    }
    const id = createId();
    const occurrence: MonthlyExpenseOccurrence = {
      id,
      name: input.name.trim(),
      category: input.category.trim(),
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
      loanId: cleanOptional(input.loanId),
      ...meta(),
    };
    await commitUpdates({ [`monthlyOccurrences/${id}`]: occurrence });
  }, [commitUpdates, data.loans, meta]);

  const updateOneTimeMonthly = useCallback(async (id: string, input: OneTimeMonthlyInput) => {
    if (!input.category.trim()) throw new Error("Selecciona una categoría.");
    const existing = data.monthlyOccurrences[id];
    if (!existing?.oneTime) throw new Error("Este gasto no es una obligación de una sola vez.");
    if (existing.status !== "upcoming") throw new Error("Solo se puede editar una obligación pendiente.");
    if (input.loanId) {
      const loan = data.loans[input.loanId];
      if (!loan || loan.archivedAt || loan.currency !== input.currency) throw new Error("Revisa el préstamo relacionado y su moneda.");
    }
    const occurrence: MonthlyExpenseOccurrence = {
      ...existing,
      name: input.name.trim(),
      category: input.category.trim(),
      expectedAmountMinor: input.estimatedAmountMinor,
      currency: input.currency,
      dueDate: input.dueDate,
      financialMonth: getMonthKey(input.dueDate),
      quincena: input.plannedQuincena,
      canPayWithCard: input.canPayWithCard,
      notes: cleanOptional(input.notes),
      excelRowLabel: cleanOptional(input.excelRowLabel),
      loanId: cleanOptional(input.loanId),
      ...meta(existing),
    };
    await commitUpdates({ [`monthlyOccurrences/${id}`]: occurrence });
  }, [commitUpdates, data.loans, data.monthlyOccurrences, meta]);

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

  const postponeObligation = useCallback(async (
    sourceType: "monthly" | "nonMonthly",
    sourceId: string,
    newDueDate: string,
  ) => {
    const existing = sourceType === "monthly"
      ? data.monthlyOccurrences[sourceId]
      : data.nonMonthlyOccurrences[sourceId];
    if (!existing) throw new Error("La obligación ya no está disponible.");
    const updated = sourceType === "monthly"
      ? buildPostponedMonthlyOccurrence(existing as MonthlyExpenseOccurrence, newDueDate, meta(existing))
      : buildPostponedNonMonthlyOccurrence(existing as NonMonthlyOccurrence, newDueDate, meta(existing));
    const path = sourceType === "monthly" ? "monthlyOccurrences" : "nonMonthlyOccurrences";
    await commitUpdates({ [`${path}/${sourceId}`]: updated });
  }, [commitUpdates, data.monthlyOccurrences, data.nonMonthlyOccurrences, meta]);

  const payObligation = useCallback(async (input: PayObligationInput) => {
    const occurrence = input.sourceType === "monthly"
      ? data.monthlyOccurrences[input.sourceId]
      : data.nonMonthlyOccurrences[input.sourceId];
    if (!occurrence || occurrence.status !== "upcoming") throw new Error("Esta obligación ya no está pendiente.");
    if (!occurrence.category) throw new Error("Asigna una categoría a la obligación antes de registrar el pago.");
    if (occurrence.currency !== input.currency) throw new Error("La moneda no coincide con la obligación.");
    if (input.amountMinor <= 0) throw new Error("El monto debe ser mayor que cero.");
    const isSavings = occurrence.category === "Ahorros";
    const savingsFund = isSavings && input.savingsFundId ? data.savingsFunds[input.savingsFundId] : undefined;
    if (isSavings && (!savingsFund || !savingsFund.active || savingsFund.currency !== input.currency)) {
      throw new Error("Selecciona un fondo de ahorro activo en la misma moneda.");
    }
    const savingsAccount = savingsFund?.moneyAccountId ? data.moneyAccounts[savingsFund.moneyAccountId] : undefined;
    if (isSavings && (!savingsAccount || !savingsAccount.active || savingsAccount.currency !== savingsFund?.currency)) {
      throw new Error("El fondo debe estar vinculado a una cuenta activa de la misma moneda.");
    }
    const paymentMethod: PaymentMethod = isSavings
      ? savingsAccount?.kind === "cash" ? "cash" : "bankTransfer"
      : input.method;
    if (!isSavings && paymentMethod === "creditCard") {
      const card = input.cardId ? data.creditCards[input.cardId] : undefined;
      if (!card?.active) throw new Error("Selecciona una tarjeta activa.");
      if (!occurrence.canPayWithCard) throw new Error("Esta obligación no admite pago con tarjeta.");
    }

    const accountId: MoneyAccountId | undefined = isSavings
      ? savingsFund?.moneyAccountId
      : paymentMethod === "cash"
      ? CASH_ACCOUNT_ID
      : paymentMethod === "bankTransfer" || paymentMethod === "debitCard"
        ? input.moneyAccountId
        : undefined;
    const accountDebitMinor = isSavings || input.currency === "DOP" ? input.amountMinor : input.settlementAmountDopMinor || 0;
    const transferFeeMinor = !isSavings && paymentMethod === "bankTransfer" ? Math.max(0, Math.round(input.transferFeeMinor || 0)) : 0;
    if (accountId) {
      if (!isSelectableMoneyAccount(data, accountId, paymentMethod as "cash" | "bankTransfer" | "debitCard")) {
        throw new Error(paymentMethod === "cash" ? "Configura primero tu saldo en Efectivo." : "Selecciona una cuenta bancaria activa.");
      }
      if (!isSavings && input.currency === "USD" && accountDebitMinor <= 0) throw new Error("Indica cuánto salió realmente en pesos dominicanos.");
      const releasableFromAccount = hasUnifiedSavingsAccounts(data)
        && input.sourceType === "nonMonthly"
        && input.currency === "DOP"
        && input.consumeReservedSavings
        ? Math.min(accountDebitMinor, getObligationAllocations(data, "nonMonthly", input.sourceId)
          .filter((allocation) => data.savingsFunds[allocation.fundId]?.moneyAccountId === accountId)
          .reduce((total, allocation) => total + allocation.amountMinor, 0))
        : 0;
      const available = getMoneyAccountSpendableBalance(data, accountId) + releasableFromAccount;
      if (accountDebitMinor + transferFeeMinor > available) {
        throw new Error(`No hay suficiente dinero disponible en ${data.moneyAccounts[accountId]?.name || "la cuenta seleccionada"}.`);
      }
    } else if (paymentMethod !== "creditCard") {
      throw new Error("Selecciona la cuenta desde donde se realizó el pago.");
    }

    const linkedLoan = occurrence.loanId ? data.loans[occurrence.loanId] : undefined;
    if (occurrence.loanId && !linkedLoan) throw new Error("El préstamo vinculado ya no está disponible.");
    if (linkedLoan && linkedLoan.currency !== input.currency) throw new Error("La moneda del préstamo no coincide con la obligación.");
    const loanInterestMinor = linkedLoan ? Math.max(0, Math.round(input.loanInterestMinor || 0)) : 0;
    const loanChargesMinor = linkedLoan ? Math.max(0, Math.round(input.loanChargesMinor || 0)) : 0;
    const loanPrincipalMinor = linkedLoan
      ? Math.max(0, Math.round(input.loanPrincipalMinor ?? input.amountMinor - loanInterestMinor - loanChargesMinor))
      : 0;
    if (linkedLoan && loanPrincipalMinor + loanInterestMinor + loanChargesMinor !== input.amountMinor) {
      throw new Error("Capital, intereses y cargos deben sumar el total pagado.");
    }
    const loanBalanceBefore = linkedLoan ? getLoanBalance(data, linkedLoan.id) : 0;
    if (linkedLoan && loanPrincipalMinor > loanBalanceBefore) throw new Error("El capital pagado no puede exceder el balance pendiente del préstamo.");

    const now = new Date().toISOString();
    const paymentId = createId();
    const cardTransactionId = paymentMethod === "creditCard" ? createId() : undefined;
    const moneyTransactionId = accountId && !isSavings ? createId() : undefined;
    const feeMoneyTransactionId = accountId && !isSavings && transferFeeMinor > 0 ? createId() : undefined;
    const loanTransactionId = linkedLoan ? createId() : undefined;
    const plannedSavingsTransactionId = savingsFund ? createId() : undefined;
    const payment: Payment = {
      id: paymentId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paidDate: input.paidDate,
      method: paymentMethod,
      cardId: input.cardId,
      cardTransactionId,
      moneyAccountId: accountId,
      moneyTransactionId,
      feeMoneyTransactionId,
      transferFeeMinor: transferFeeMinor || undefined,
      settlementAmountDopMinor: input.currency === "USD" && accountId ? accountDebitMinor : undefined,
      loanId: linkedLoan?.id,
      loanTransactionId,
      savingsTransactionIds: plannedSavingsTransactionId ? [plannedSavingsTransactionId] : undefined,
      notes: cleanOptional(input.notes),
      ...meta(),
    };
    const updates: Record<string, unknown> = { [`payments/${paymentId}`]: payment };

    if (savingsFund && plannedSavingsTransactionId) {
      updates[`savingsTransactions/${plannedSavingsTransactionId}`] = {
        id: plannedSavingsTransactionId,
        fundId: savingsFund.id,
        type: "deposit",
        amountMinor: input.amountMinor,
        currency: input.currency,
        transactionDate: input.paidDate,
        linkedPaymentId: paymentId,
        notes: `Ahorro planificado · ${occurrence.name}`,
        ...meta(),
      } satisfies SavingsTransaction;
    }

    if (accountId && moneyTransactionId) {
      updates[`moneyTransactions/${moneyTransactionId}`] = {
        id: moneyTransactionId,
        accountId,
        direction: "out",
        type: linkedLoan ? "loanPayment" : "payment",
        amountMinor: accountDebitMinor,
        currency: "DOP",
        transactionDate: input.paidDate,
        description: occurrence.name,
        linkedPaymentId: paymentId,
        linkedLoanTransactionId: loanTransactionId,
        ...meta(),
      } satisfies MoneyTransaction;
    }
    if (accountId && feeMoneyTransactionId && transferFeeMinor > 0) {
      updates[`moneyTransactions/${feeMoneyTransactionId}`] = {
        id: feeMoneyTransactionId,
        accountId,
        direction: "out",
        type: "fee",
        amountMinor: transferFeeMinor,
        currency: "DOP",
        transactionDate: input.paidDate,
        description: `Comisión por transferencia · ${occurrence.name}`,
        linkedPaymentId: paymentId,
        ...meta(),
      } satisfies MoneyTransaction;
    }

    if (linkedLoan && loanTransactionId) {
      const loanTransaction: LoanTransaction = {
        id: loanTransactionId,
        loanId: linkedLoan.id,
        type: "payment",
        transactionDate: input.paidDate,
        totalPaymentMinor: input.amountMinor,
        principalMinor: loanPrincipalMinor,
        interestMinor: loanInterestMinor,
        chargesMinor: loanChargesMinor,
        balanceBeforeMinor: loanBalanceBefore,
        balanceAfterMinor: Math.max(0, loanBalanceBefore - loanPrincipalMinor),
        linkedPaymentId: paymentId,
        notes: cleanOptional(input.notes),
        ...meta(),
      };
      updates[`loanTransactions/${loanTransactionId}`] = loanTransaction;
      if (loanTransaction.balanceAfterMinor === 0) {
        updates[`loans/${linkedLoan.id}`] = { ...linkedLoan, active: false, ...meta(linkedLoan) };
      }
    }

    if (paymentMethod === "creditCard" && cardTransactionId && input.cardId) {
      const transaction: CardTransaction = {
        id: cardTransactionId,
        cardId: input.cardId,
        currency: input.currency,
        type: "charge",
        amountMinor: input.amountMinor,
        transactionDate: input.paidDate,
        description: occurrence.name,
        category: occurrence.category,
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
          purchaseMethod: paymentMethod,
          linkedCardTransactionId: cardTransactionId,
          purchasedAt: input.paidDate,
          ...meta(goal),
        };
      }
    }

    const savingsTransactionIds: string[] = [];
    if (input.sourceType === "nonMonthly" && paymentMethod !== "creditCard" && input.consumeReservedSavings) {
      let amountLeft = input.amountMinor;
      const allocations = getObligationAllocations(data, "nonMonthly", input.sourceId);
      for (const allocation of allocations) {
        const canConsume = amountLeft > 0 && (!hasUnifiedSavingsAccounts(data)
          || !accountId
          || data.savingsFunds[allocation.fundId]?.moneyAccountId === accountId);
        if (!canConsume) {
          updates[`savingsAllocations/${allocation.id}`] = {
            ...allocation,
            active: false,
            releasedAt: now,
            ...meta(allocation),
          };
          continue;
        }
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
        reconciledAt: null,
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
    for (const transactionId of [payment.moneyTransactionId, payment.feeMoneyTransactionId]) {
      if (!transactionId) continue;
      const transaction = data.moneyTransactions[transactionId];
      if (transaction) updates[`moneyTransactions/${transactionId}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
    }
    if (payment.loanTransactionId && data.loanTransactions[payment.loanTransactionId]) {
      const transaction = data.loanTransactions[payment.loanTransactionId];
      updates[`loanTransactions/${transaction.id}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
      const loan = data.loans[transaction.loanId];
      if (loan && !loan.active) updates[`loans/${loan.id}`] = { ...loan, active: true, ...meta(loan) };
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

  const receiveIncome = useCallback(async (id: string, amountMinor: number, receivedDate: string, moneyAccountId?: MoneyAccountId) => {
    const occurrence = data.incomeOccurrences[id];
    if (!occurrence) return;
    if (!moneyAccountId) throw new Error("Selecciona dónde recibiste el ingreso.");
    if (moneyAccountId) {
      const account = data.moneyAccounts[moneyAccountId];
      const valid = account?.kind === "cash"
        ? isSelectableMoneyAccount(data, moneyAccountId, "cash", occurrence.currency)
        : isSelectableMoneyAccount(data, moneyAccountId, "bankTransfer", occurrence.currency);
      if (!valid) throw new Error(`Selecciona una cuenta activa en ${occurrence.currency} para recibir el ingreso.`);
    }
    const transactionId = createId();
    const updates: Record<string, unknown> = {
      [`incomeOccurrences/${id}`]: {
        ...occurrence,
        status: "received",
        actualAmountMinor: amountMinor,
        receivedDate,
        moneyAccountId,
        moneyTransactionId: transactionId,
        ...meta(occurrence),
      },
    };
    if (moneyAccountId) {
      updates[`moneyTransactions/${transactionId}`] = {
        id: transactionId,
        accountId: moneyAccountId,
        direction: "in",
        type: "income",
        amountMinor,
        currency: occurrence.currency,
        transactionDate: receivedDate,
        description: occurrence.name,
        linkedIncomeOccurrenceId: occurrence.id,
        ...meta(),
      } satisfies MoneyTransaction;
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const reopenIncome = useCallback(async (id: string) => {
    const occurrence = data.incomeOccurrences[id];
    if (!occurrence) return;
    const updates: Record<string, unknown> = {
      [`incomeOccurrences/${id}`]: {
        ...occurrence,
        status: "expected",
        actualAmountMinor: null,
        receivedDate: null,
        reconciledAt: null,
        moneyAccountId: null,
        moneyTransactionId: null,
        ...meta(occurrence),
      },
    };
    if (occurrence.moneyTransactionId && data.moneyTransactions[occurrence.moneyTransactionId]) {
      const transaction = data.moneyTransactions[occurrence.moneyTransactionId];
      updates[`moneyTransactions/${transaction.id}`] = { ...transaction, reversedAt: new Date().toISOString(), ...meta(transaction) };
    }
    await commitUpdates(updates);
  }, [commitUpdates, data.incomeOccurrences, data.moneyTransactions, meta]);

  const saveNonMonthly = useCallback(async (input: NonMonthlyInput, id?: string) => {
    if (!input.category.trim()) throw new Error("Selecciona una categoría.");
    if (input.loanId) {
      const loan = data.loans[input.loanId];
      if (!loan || loan.archivedAt || loan.currency !== input.currency) throw new Error("Revisa el préstamo relacionado y su moneda.");
    }
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
      category: input.category.trim(),
      notes: cleanOptional(input.notes),
      loanId: cleanOptional(input.loanId),
      ...meta(existing),
    };
    const updates: Record<string, unknown> = { [`nonMonthlyExpenses/${planId}`]: plan };
    const pending = Object.values(data.nonMonthlyOccurrences)
      .filter((occurrence) => occurrence.planId === planId && occurrence.status === "upcoming")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (pending) {
      const occurrenceId = pending.postponedAt ? pending.id : `${planId}_${input.nextDueDate}`;
      const updatedOccurrence: NonMonthlyOccurrence = {
        ...pending,
        id: occurrenceId,
        name: plan.name,
        category: plan.category,
        expectedAmountMinor: plan.estimatedAmountMinor,
        currency: plan.currency,
        dueDate: pending.postponedAt ? pending.dueDate : plan.nextDueDate,
        canPayWithCard: plan.canPayWithCard,
        notes: plan.notes,
        loanId: plan.loanId,
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
  }, [commitUpdates, data.loans, data.nonMonthlyExpenses, data.nonMonthlyOccurrences, data.savingsAllocations, meta]);

  const saveSavingsFund = useCallback(async (input: SavingsFundInput, id?: string) => {
    const fundId = id || createId();
    const existing = data.savingsFunds[fundId];
    if (input.moneyAccountId) {
      const account = data.moneyAccounts[input.moneyAccountId];
      if (!account || account.archivedAt || account.currency !== input.currency) {
        throw new Error(`Selecciona una cuenta ${input.currency} disponible para indicar dónde está guardado el ahorro.`);
      }
    }
    if (existing && existing.currency !== input.currency) {
      const hasHistory = Object.values(data.savingsTransactions).some((transaction) => transaction.fundId === fundId)
        || Object.values(data.savingsAllocations).some((allocation) => allocation.fundId === fundId);
      if (hasHistory) throw new Error("No se puede cambiar la moneda de un fondo con movimientos o asignaciones.");
    }
    const currentBalance = existing ? getFundBalance(data, fundId) : 0;
    if (hasUnifiedSavingsAccounts(data)) {
      if (!input.moneyAccountId && (currentBalance > 0 || (input.initialBalanceMinor || 0) > 0)) {
        throw new Error("Selecciona la cuenta donde está guardado este ahorro.");
      }
      if (existing && currentBalance > 0 && existing.moneyAccountId !== input.moneyAccountId) {
        throw new Error("Para cambiar de cuenta un fondo con dinero, crea un fondo en la nueva cuenta y usa Transferir a otro fondo.");
      }
      if (!existing && input.moneyAccountId && (input.initialBalanceMinor || 0) > getMoneyAccountSpendableBalance(data, input.moneyAccountId)) {
        throw new Error("El monto inicial excede el disponible sin apartar de la cuenta seleccionada.");
      }
    }
    const { initialBalanceMinor, ...fundInput } = input;
    const fund: SavingsFund = {
      id: fundId,
      ...fundInput,
      name: input.name.trim(),
      moneyAccountId: input.moneyAccountId || undefined,
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
    if (!amountMinor || !Number.isFinite(amountMinor)) throw new Error("El monto debe ser mayor que cero.");
    if (!fund.active && (type === "deposit" || type === "transferIn")) {
      throw new Error("Activa el fondo antes de añadir dinero nuevo.");
    }
    const effect = getSavingsTransactionEffect(type, amountMinor);
    if (effect < 0 && Math.abs(effect) > getFundBalance(data, fundId) - getFundAllocated(data, fundId)) {
      throw new Error("El monto excede el balance no asignado del fondo.");
    }
    if (hasUnifiedSavingsAccounts(data) && effect > 0) {
      if (!fund.moneyAccountId) throw new Error("Vincula el fondo a una cuenta antes de apartar dinero.");
      if (effect > getMoneyAccountSpendableBalance(data, fund.moneyAccountId)) {
        throw new Error(`La cuenta no tiene suficiente disponible sin apartar para reservar este monto.`);
      }
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
    if (amountMinor <= 0) throw new Error("El monto debe ser mayor que cero.");
    if (!to.active) throw new Error("El fondo de destino está inactivo.");
    if (amountMinor > getFundBalance(data, fromFundId) - getFundAllocated(data, fromFundId)) throw new Error("El monto excede el balance no asignado.");
    const transferId = createId();
    const outId = createId();
    const inId = createId();
    const base = { currency: from.currency, transactionDate: date, transferId, notes: `Transferencia a ${to.name}` };
    const updates: Record<string, unknown> = {
      [`savingsTransactions/${outId}`]: { id: outId, fundId: fromFundId, type: "transferOut", amountMinor, ...base, ...meta() },
      [`savingsTransactions/${inId}`]: { id: inId, fundId: toFundId, type: "transferIn", amountMinor, ...base, notes: `Transferencia desde ${from.name}`, ...meta() },
    };
    if (hasUnifiedSavingsAccounts(data)) {
      if (!from.moneyAccountId || !to.moneyAccountId) throw new Error("Ambos fondos deben estar vinculados a una cuenta.");
      if (from.moneyAccountId !== to.moneyAccountId) {
        const fromAccount = data.moneyAccounts[from.moneyAccountId];
        const toAccount = data.moneyAccounts[to.moneyAccountId];
        if (!fromAccount || !toAccount || fromAccount.currency !== from.currency || toAccount.currency !== to.currency) {
          throw new Error("Las cuentas vinculadas a los fondos no son compatibles.");
        }
        const moneyOutId = createId();
        const moneyInId = createId();
        updates[`moneyTransactions/${moneyOutId}`] = {
          id: moneyOutId, accountId: fromAccount.id, direction: "out", type: "transfer", amountMinor,
          currency: from.currency, transactionDate: date, description: `${from.name} → ${to.name}`,
          transferId, notes: "Traslado físico de ahorro entre cuentas", ...meta(),
        } satisfies MoneyTransaction;
        updates[`moneyTransactions/${moneyInId}`] = {
          id: moneyInId, accountId: toAccount.id, direction: "in", type: "transfer", amountMinor,
          currency: to.currency, transactionDate: date, description: `${from.name} → ${to.name}`,
          transferId, notes: "Traslado físico de ahorro entre cuentas", ...meta(),
        } satisfies MoneyTransaction;
      }
    }
    await commitUpdates(updates);
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
    if (!input.category.trim()) throw new Error("Selecciona una categoría.");
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
      category: input.category.trim(),
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
    if (!goal.category) throw new Error("Selecciona una categoría para la meta antes de programarla.");
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
    paymentMethod: Exclude<PaymentMethod, "creditCard"> = "cash",
  ) => {
    const goal = data.purchaseGoals[goalId];
    if (!goal || goal.status !== "active") throw new Error("La meta ya no está disponible para comprar.");
    if (!goal.category) throw new Error("Selecciona una categoría para la meta antes de comprarla.");
    if (actualAmountMinor <= 0 || actualPaymentDopMinor <= 0) throw new Error("Escribe montos válidos para la compra.");
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      [`purchaseGoals/${goalId}`]: {
        ...goal,
        status: "purchased",
        actualAmountMinor,
        actualPaymentDopMinor: goal.currency === "USD" ? actualPaymentDopMinor : undefined,
        purchaseMethod: paymentMethod,
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
    if (!goal.category) throw new Error("Selecciona una categoría para la meta antes de comprarla.");
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
      category: goal.category,
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
    if (!expense.category?.trim()) throw new Error("Selecciona una categoría para el gasto.");
    const linkedTransactions = Object.values(data.cardTransactions)
      .filter((transaction) => transaction.linkedDailyExpenseId === expense.id
        && transaction.type === "charge"
        && !transaction.reversedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();
    const linkedMoneyTransactions = Object.values(data.moneyTransactions)
      .filter((transaction) => transaction.linkedDailyExpenseId === expense.id && !transaction.reversedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (expense.paymentMethod !== "creditCard") {
      linkedTransactions.forEach((transaction) => {
        updates[`cardTransactions/${transaction.id}`] = {
          ...transaction,
          reversedAt: now,
          ...meta(transaction),
        };
      });
      const accountId: MoneyAccountId | undefined = expense.paymentMethod === "cash" ? CASH_ACCOUNT_ID : expense.moneyAccountId;
      const financeMethod = expense.paymentMethod === "cash" ? "cash" : expense.paymentMethod === "debit" ? "debitCard" : "bankTransfer";
      if (!accountId || !isSelectableMoneyAccount(data, accountId, financeMethod)) {
        throw new Error(expense.paymentMethod === "cash" ? "Configura primero tu saldo en Efectivo." : "Selecciona el banco y la cuenta usados para este gasto.");
      }
      const amountMinor = expense.unitPriceCents * expense.quantity;
      const feeMinor = expense.paymentMethod === "transfer" ? Math.max(0, expense.transferFeeCents || 0) : 0;
      const replaceableBalance = linkedMoneyTransactions
        .filter((transaction) => transaction.accountId === accountId)
        .reduce((total, transaction) => total + transaction.amountMinor, getMoneyAccountSpendableBalance(data, accountId));
      if (amountMinor + feeMinor > replaceableBalance) {
        throw new Error(`No hay suficiente dinero disponible en ${data.moneyAccounts[accountId]?.name || "la cuenta seleccionada"}.`);
      }
      const existingExpenseMovement = linkedMoneyTransactions.find((transaction) => transaction.type === "expense");
      const expenseMovementId = existingExpenseMovement?.id || createId();
      updates[`moneyTransactions/${expenseMovementId}`] = {
        ...(existingExpenseMovement || {}),
        id: expenseMovementId,
        accountId,
        direction: "out",
        type: "expense",
        amountMinor,
        currency: "DOP",
        transactionDate: expense.occurredDate,
        description: expense.name,
        linkedDailyExpenseId: expense.id,
        reversedAt: undefined,
        ...meta(existingExpenseMovement),
      } satisfies MoneyTransaction;
      const existingFeeMovement = linkedMoneyTransactions.find((transaction) => transaction.type === "fee");
      if (feeMinor > 0) {
        const feeId = existingFeeMovement?.id || createId();
        updates[`moneyTransactions/${feeId}`] = {
          ...(existingFeeMovement || {}),
          id: feeId,
          accountId,
          direction: "out",
          type: "fee",
          amountMinor: feeMinor,
          currency: "DOP",
          transactionDate: expense.occurredDate,
          description: `Comisión por transferencia · ${expense.name}`,
          linkedDailyExpenseId: expense.id,
          reversedAt: undefined,
          ...meta(existingFeeMovement),
        } satisfies MoneyTransaction;
      } else if (existingFeeMovement) {
        updates[`moneyTransactions/${existingFeeMovement.id}`] = { ...existingFeeMovement, reversedAt: now, ...meta(existingFeeMovement) };
      }
      linkedMoneyTransactions
        .filter((transaction) => transaction.id !== expenseMovementId && transaction.id !== existingFeeMovement?.id)
        .forEach((transaction) => {
          updates[`moneyTransactions/${transaction.id}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
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
        category: expense.category,
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
      linkedMoneyTransactions.forEach((transaction) => {
        updates[`moneyTransactions/${transaction.id}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
      });
    }

    if (Object.keys(updates).length) await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

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
    Object.values(data.moneyTransactions)
      .filter((transaction) => transaction.linkedDailyExpenseId === expenseId && !transaction.reversedAt)
      .forEach((transaction) => {
        updates[`moneyTransactions/${transaction.id}`] = { ...transaction, reversedAt: now, ...meta(transaction) };
      });
    if (Object.keys(updates).length) await commitUpdates(updates);
  }, [commitUpdates, data.cardTransactions, data.moneyTransactions, meta]);

  const saveCreditCard = useCallback(async (input: CreditCardInput, id?: string) => {
    const cardId = id || createId();
    const existing = data.creditCards[cardId];
    if (input.bankId && (!data.banks[input.bankId] || data.banks[input.bankId].archivedAt)) {
      throw new Error("Selecciona un banco válido para la tarjeta.");
    }
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
      bankId: cleanOptional(input.bankId),
      bank: input.bankId ? undefined : cleanOptional(input.bank),
      lastFour: cleanOptional(input.lastFour)?.slice(-4),
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    await commitUpdates({ [`creditCards/${cardId}`]: card });
  }, [commitUpdates, data.banks, data.cardStatements, data.cardTransactions, data.creditCards, meta]);

  const addCardTransaction = useCallback(async (
    cardId: string,
    currency: Currency,
    type: CardTransaction["type"],
    amountMinor: number,
    transactionDate: string,
    description: string,
    savingsFundId?: string,
    settlementAmountDopMinor?: number,
    affectsCurrentBalance = true,
    moneyAccountId?: MoneyAccountId,
    paymentMethod: Exclude<PaymentMethod, "creditCard"> = "bankTransfer",
    transferFeeMinor = 0,
    category?: string,
  ) => {
    const card = data.creditCards[cardId];
    if (!card) throw new Error("Tarjeta no encontrada.");
    if (type === "charge" && !card.active) throw new Error("La tarjeta está inactiva.");
    if (type === "charge" && !category?.trim()) throw new Error("Selecciona una categoría para la compra o cargo.");
    if (amountMinor <= 0 && type !== "adjustment") throw new Error("El monto debe ser mayor que cero.");
    if (type === "payment") {
      if (affectsCurrentBalance) {
        const currentDebt = getCardCurrentDebt(data, cardId, currency);
        if (currentDebt <= 0) throw new Error(`La tarjeta no tiene deuda pendiente en ${currency}.`);
        if (amountMinor > currentDebt) throw new Error("El pago no puede exceder la deuda pendiente. Para corregir el balance, registra un ajuste.");
      }
      if (currency === "USD" && (!settlementAmountDopMinor || settlementAmountDopMinor <= 0)) {
        throw new Error("Escribe el monto real pagado en pesos dominicanos.");
      }
      if (!affectsCurrentBalance && savingsFundId) {
        throw new Error("Un pago ya incluido en la deuda actual no puede retirar dinero de ahorros otra vez.");
      }
      if (affectsCurrentBalance) {
        if (!moneyAccountId) throw new Error("Selecciona de dónde salió el dinero.");
        if (!isSelectableMoneyAccount(data, moneyAccountId, paymentMethod)) {
          throw new Error(paymentMethod === "cash" ? "Configura primero tu saldo en Efectivo." : "Selecciona una cuenta bancaria activa.");
        }
        const cashAmount = currency === "USD" ? Math.abs(settlementAmountDopMinor || 0) : Math.abs(amountMinor);
        const fee = paymentMethod === "bankTransfer" ? Math.max(0, Math.round(transferFeeMinor)) : 0;
        const selectedFund = savingsFundId ? data.savingsFunds[savingsFundId] : undefined;
        if (hasUnifiedSavingsAccounts(data) && selectedFund && selectedFund.moneyAccountId !== moneyAccountId) {
          throw new Error("El fondo elegido debe estar guardado en la misma cuenta usada para pagar la tarjeta.");
        }
        const releasedSavings = hasUnifiedSavingsAccounts(data) && selectedFund?.moneyAccountId === moneyAccountId
          ? Math.min(cashAmount, getFundBalance(data, selectedFund.id))
          : 0;
        if (cashAmount + fee > getMoneyAccountSpendableBalance(data, moneyAccountId) + releasedSavings) {
          throw new Error(`No hay suficiente dinero disponible en ${data.moneyAccounts[moneyAccountId]?.name || "la cuenta seleccionada"}.`);
        }
      }
    }
    const id = createId();
    const paymentCashAmount = type === "payment"
      ? currency === "USD" ? Math.abs(settlementAmountDopMinor || 0) : Math.abs(amountMinor)
      : 0;
    const normalizedFee = type === "payment" && affectsCurrentBalance && paymentMethod === "bankTransfer"
      ? Math.max(0, Math.round(transferFeeMinor))
      : 0;
    const moneyTransactionIds: string[] = [];
    const transaction: CardTransaction = {
      id,
      cardId,
      currency,
      type,
      amountMinor,
      settlementAmountDopMinor: type === "payment" && currency === "USD"
        ? settlementAmountDopMinor
        : undefined,
      affectsCurrentBalance: type === "payment" ? affectsCurrentBalance : undefined,
      transactionDate,
      description: description.trim(),
      category: type === "charge" ? category!.trim() : undefined,
      moneyAccountId: type === "payment" && affectsCurrentBalance ? moneyAccountId : undefined,
      paymentMethod: type === "payment" && affectsCurrentBalance ? paymentMethod : undefined,
      transferFeeMinor: normalizedFee || undefined,
      ...meta(),
    };
    const updates: Record<string, unknown> = { [`cardTransactions/${id}`]: transaction };
    if (type === "payment" && affectsCurrentBalance && moneyAccountId) {
      const cashTransactionId = createId();
      moneyTransactionIds.push(cashTransactionId);
      updates[`moneyTransactions/${cashTransactionId}`] = {
        id: cashTransactionId,
        accountId: moneyAccountId,
        direction: "out",
        type: "cardPayment",
        amountMinor: paymentCashAmount,
        currency: "DOP",
        transactionDate,
        description: description.trim(),
        linkedCardTransactionId: id,
        ...meta(),
      } satisfies MoneyTransaction;
      if (normalizedFee > 0) {
        const feeId = createId();
        moneyTransactionIds.push(feeId);
        updates[`moneyTransactions/${feeId}`] = {
          id: feeId,
          accountId: moneyAccountId,
          direction: "out",
          type: "fee",
          amountMinor: normalizedFee,
          currency: "DOP",
          transactionDate,
          description: `Comisión por transferencia · ${description.trim()}`,
          linkedCardTransactionId: id,
          ...meta(),
        } satisfies MoneyTransaction;
      }
      transaction.moneyTransactionIds = moneyTransactionIds;
      updates[`cardTransactions/${id}`] = transaction;
    }
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
    for (const transactionId of transaction.moneyTransactionIds || []) {
      const moneyTransaction = data.moneyTransactions[transactionId];
      if (moneyTransaction) updates[`moneyTransactions/${transactionId}`] = { ...moneyTransaction, reversedAt: now, ...meta(moneyTransaction) };
    }
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
  }, [commitUpdates, data, meta]);

  const saveBank = useCallback(async (input: BankInput, id?: string) => {
    if (!input.name.trim()) throw new Error("Escribe el nombre del banco.");
    const bankId = id || createId();
    const existing = data.banks[bankId];
    const bank: Bank = {
      id: bankId,
      name: input.name.trim(),
      active: input.active,
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    await commitUpdates({ [`banks/${bankId}`]: bank });
  }, [commitUpdates, data.banks, meta]);

  const deleteEmptyBank = useCallback(async (bankId: string) => {
    const bank = data.banks[bankId];
    if (!bank) return;
    const hasLinkedProduct = Object.values(data.moneyAccounts).some((account) => account.bankId === bankId)
      || Object.values(data.creditCards).some((card) => !card.archivedAt && card.bankId === bankId)
      || Object.values(data.loans).some((loan) => !loan.archivedAt && loan.bankId === bankId);
    if (hasLinkedProduct) throw new Error("Este banco tiene cuentas o productos vinculados y no puede eliminarse.");
    await commitUpdates({ [`banks/${bankId}`]: null });
  }, [commitUpdates, data.banks, data.creditCards, data.loans, data.moneyAccounts]);

  const saveMoneyAccount = useCallback(async (input: MoneyAccountInput, id?: string) => {
    const bank = data.banks[input.bankId];
    if (!bank || bank.archivedAt) throw new Error("Selecciona un banco válido.");
    if (!input.name.trim() || input.openingBalanceMinor < 0) throw new Error("Revisa el nombre y el balance de la cuenta.");
    const accountId = id || createId();
    if (accountId === CASH_ACCOUNT_ID || accountId === LEGACY_BANK_ACCOUNT_ID) throw new Error("Esta cuenta está reservada por el sistema.");
    const existing = data.moneyAccounts[accountId];
    const hasHistory = Boolean(existing && Object.values(data.moneyTransactions).some((item) => item.accountId === accountId));
    const hasLinkedSavings = Boolean(existing && Object.values(data.savingsFunds).some((fund) => fund.moneyAccountId === accountId));
    if (existing && existing.currency !== input.currency && hasLinkedSavings) {
      throw new Error("Desvincula primero los fondos de ahorro antes de cambiar la moneda de esta cuenta.");
    }
    if (existing && hasHistory && (existing.bankId !== input.bankId || existing.currency !== input.currency || existing.openingBalanceMinor !== input.openingBalanceMinor || existing.openingDate !== input.openingDate)) {
      throw new Error("Una cuenta con historial no puede cambiar de banco, moneda ni saldo inicial. Usa Ajustar balance.");
    }
    if (!existing && input.currency === "DOP" && input.openingBalanceMinor > 0 && getLegacyBankBalance(data) > 0) {
      throw new Error("Crea la cuenta con balance cero y distribuye primero el saldo bancario anterior.");
    }
    const account: MoneyAccount = {
      id: accountId,
      kind: "bank",
      bankId: input.bankId,
      accountType: input.accountType,
      name: input.name.trim(),
      lastFour: cleanOptional(input.lastFour)?.slice(-4),
      currency: input.currency,
      openingBalanceMinor: Math.round(input.openingBalanceMinor),
      openingDate: input.openingDate,
      active: input.active,
      notes: cleanOptional(input.notes),
      ...meta(existing),
    };
    await commitUpdates({ [`moneyAccounts/${accountId}`]: account });
  }, [commitUpdates, data, meta]);

  const initializeCashAccount = useCallback(async (openingBalanceMinor: number, openingDate: string) => {
    if (data.moneyAccounts[CASH_ACCOUNT_ID]) throw new Error("Efectivo ya está configurado. Usa Ajustar balance.");
    if (openingBalanceMinor < 0) throw new Error("El balance no puede ser negativo.");
    const cash: MoneyAccount = {
      id: CASH_ACCOUNT_ID,
      kind: "cash",
      name: "Efectivo",
      currency: "DOP",
      openingBalanceMinor: Math.round(openingBalanceMinor),
      openingDate,
      active: true,
      notes: "Saldo inicial confirmado; incluye movimientos anteriores.",
      ...meta(),
    };
    await commitUpdates({ [`moneyAccounts/${CASH_ACCOUNT_ID}`]: cash });
  }, [commitUpdates, data.moneyAccounts, meta]);

  const initializeMoneyAccounts = useCallback(async (input: MoneyAccountsSetupInput) => {
    if (hasInitializedMoneyAccounts(data)) throw new Error("Los saldos iniciales ya fueron configurados.");
    if (input.bankBalanceMinor < 0 || input.cashBalanceMinor < 0) throw new Error("Los saldos iniciales no pueden ser negativos.");
    const bank: MoneyAccount = {
      id: BANK_ACCOUNT_ID,
      kind: "bank",
      name: "Banco",
      currency: "DOP",
      openingBalanceMinor: Math.round(input.bankBalanceMinor),
      openingDate: input.openingDate,
      active: true,
      notes: "Saldo inicial confirmado; incluye movimientos anteriores.",
      ...meta(),
    };
    const cash: MoneyAccount = {
      id: CASH_ACCOUNT_ID,
      kind: "cash",
      name: "Efectivo",
      currency: "DOP",
      openingBalanceMinor: Math.round(input.cashBalanceMinor),
      openingDate: input.openingDate,
      active: true,
      notes: "Saldo inicial confirmado; incluye movimientos anteriores.",
      ...meta(),
    };
    await commitUpdates({ [`moneyAccounts/${BANK_ACCOUNT_ID}`]: bank, [`moneyAccounts/${CASH_ACCOUNT_ID}`]: cash });
  }, [commitUpdates, data, meta]);

  const adjustMoneyAccountBalance = useCallback(async (
    accountId: MoneyAccountId,
    exactBalanceMinor: number,
    transactionDate: string,
    notes?: string,
  ) => {
    const account = data.moneyAccounts[accountId];
    if (!account) throw new Error("La cuenta todavía no está configurada.");
    if (exactBalanceMinor < 0) throw new Error("El balance no puede ser negativo.");
    const reserved = getAccountReservedSavings(data, accountId);
    if (hasUnifiedSavingsAccounts(data) && exactBalanceMinor < reserved) {
      throw new Error("El balance total no puede quedar por debajo del ahorro apartado en esta cuenta.");
    }
    const current = getMoneyAccountBalance(data, accountId);
    const difference = Math.round(exactBalanceMinor) - current;
    if (!difference) throw new Error("El balance ya coincide con el monto indicado.");
    const id = createId();
    const transaction: MoneyTransaction = {
      id,
      accountId,
      direction: difference > 0 ? "in" : "out",
      type: "adjustment",
      amountMinor: Math.abs(difference),
      currency: account.currency,
      transactionDate,
      description: `Ajuste de balance · ${account.name}`,
      notes: cleanOptional(notes),
      ...meta(),
    };
    await commitUpdates({ [`moneyTransactions/${id}`]: transaction });
  }, [commitUpdates, data, meta]);

  const transferMoney = useCallback(async (
    fromAccountId: MoneyAccountId,
    toAccountId: MoneyAccountId,
    amountMinor: number,
    transactionDate: string,
    feeMinor = 0,
    notes?: string,
  ) => {
    if (fromAccountId === toAccountId) throw new Error("Selecciona cuentas diferentes.");
    const fromAccount = data.moneyAccounts[fromAccountId];
    const toAccount = data.moneyAccounts[toAccountId];
    if (!fromAccount || !toAccount || fromAccount.archivedAt || toAccount.archivedAt) throw new Error("Selecciona cuentas disponibles.");
    if (fromAccount.currency !== toAccount.currency) throw new Error("Solo puedes mover dinero entre cuentas de la misma moneda.");
    if (toAccount.id === LEGACY_BANK_ACCOUNT_ID) throw new Error("El saldo bancario anterior solo puede usarse como origen.");
    const amount = Math.round(amountMinor);
    const fee = fromAccount.kind === "bank" ? Math.max(0, Math.round(feeMinor)) : 0;
    if (amount <= 0) throw new Error("El monto debe ser mayor que cero.");
    if (amount + fee > getMoneyAccountSpendableBalance(data, fromAccountId)) throw new Error("El origen no tiene suficiente disponible sin apartar.");
    const transferId = createId();
    const outId = createId();
    const inId = createId();
    const fromName = fromAccount.name;
    const toName = toAccount.name;
    const updates: Record<string, unknown> = {
      [`moneyTransactions/${outId}`]: {
        id: outId, accountId: fromAccountId, direction: "out", type: "transfer", amountMinor: amount,
        currency: fromAccount.currency, transactionDate, description: `${fromName} → ${toName}`, transferId, notes: cleanOptional(notes), ...meta(),
      } satisfies MoneyTransaction,
      [`moneyTransactions/${inId}`]: {
        id: inId, accountId: toAccountId, direction: "in", type: "transfer", amountMinor: amount,
        currency: fromAccount.currency, transactionDate, description: `${fromName} → ${toName}`, transferId, notes: cleanOptional(notes), ...meta(),
      } satisfies MoneyTransaction,
    };
    if (fee > 0) {
      const feeId = createId();
      updates[`moneyTransactions/${feeId}`] = {
        id: feeId, accountId: fromAccountId, direction: "out", type: "fee", amountMinor: fee,
        currency: fromAccount.currency, transactionDate, description: `Comisión · ${fromName} → ${toName}`, transferId, notes: cleanOptional(notes), ...meta(),
      } satisfies MoneyTransaction;
    }
    if (fromAccountId === LEGACY_BANK_ACCOUNT_ID && amount + fee === getMoneyAccountBalance(data, fromAccountId)) {
      updates[`moneyAccounts/${LEGACY_BANK_ACCOUNT_ID}`] = { ...fromAccount, active: false, ...meta(fromAccount) };
    }
    await commitUpdates(updates);
  }, [commitUpdates, data, meta]);

  const saveLoan = useCallback(async (input: LoanInput, id?: string) => {
    const loanId = id || createId();
    const existing = data.loans[loanId];
    if (input.bankId && (!data.banks[input.bankId] || data.banks[input.bankId].archivedAt)) {
      throw new Error("Selecciona un banco válido para el préstamo.");
    }
    if (!input.name.trim() || input.openingBalanceMinor < 0 || input.annualInterestRate < 0) throw new Error("Revisa el nombre, balance y tasa del préstamo.");
    if (existing && Object.values(data.loanTransactions).some((transaction) => transaction.loanId === loanId)) {
      if (existing.currency !== input.currency || existing.openingDate !== input.openingDate || existing.openingBalanceMinor !== input.openingBalanceMinor) {
        throw new Error("Usa Ajustar balance para igualar un préstamo que ya tiene historial.");
      }
    }
    const loan: Loan = {
      id: loanId,
      ...input,
      name: input.name.trim(),
      bankId: cleanOptional(input.bankId),
      lender: input.bankId ? undefined : cleanOptional(input.lender),
      notes: cleanOptional(input.notes),
      openingBalanceMinor: Math.round(input.openingBalanceMinor),
      annualInterestRate: Math.max(0, input.annualInterestRate),
      ...meta(existing),
    };
    await commitUpdates({ [`loans/${loanId}`]: loan });
  }, [commitUpdates, data.banks, data.loanTransactions, data.loans, meta]);

  const adjustLoanBalance = useCallback(async (loanId: string, exactBalanceMinor: number, transactionDate: string, notes?: string) => {
    const loan = data.loans[loanId];
    if (!loan) throw new Error("Préstamo no encontrado.");
    if (exactBalanceMinor < 0) throw new Error("El balance no puede ser negativo.");
    const balanceBeforeMinor = getLoanBalance(data, loanId);
    const adjustmentMinor = Math.round(exactBalanceMinor) - balanceBeforeMinor;
    if (!adjustmentMinor) throw new Error("El balance ya coincide con el banco.");
    const id = createId();
    const transaction: LoanTransaction = {
      id,
      loanId,
      type: "adjustment",
      transactionDate,
      adjustmentMinor,
      balanceBeforeMinor,
      balanceAfterMinor: Math.round(exactBalanceMinor),
      notes: cleanOptional(notes) || "Balance confirmado según el banco.",
      ...meta(),
    };
    await commitUpdates({
      [`loanTransactions/${id}`]: transaction,
      [`loans/${loanId}`]: { ...loan, active: exactBalanceMinor > 0, ...meta(loan) },
    });
  }, [commitUpdates, data, meta]);

  const reverseLoanAdjustment = useCallback(async (transactionId: string) => {
    const transaction = data.loanTransactions[transactionId];
    if (!transaction || transaction.reversedAt) return;
    if (transaction.linkedPaymentId) throw new Error("Reabre la factura relacionada para corregir este pago.");
    await commitUpdates({
      [`loanTransactions/${transactionId}`]: { ...transaction, reversedAt: new Date().toISOString(), ...meta(transaction) },
    });
  }, [commitUpdates, data.loanTransactions, meta]);

  const updateSettings = useCallback(async (settings: AppSettings) => {
    await commitUpdates({ settings: { ...settings, updatedAt: new Date().toISOString(), updatedBy: actor } });
  }, [actor, commitUpdates]);

  const reconcileStartingPoint = useCallback(async (input: StartingPointReconciliationInput) => {
    await commitUpdates(buildStartingPointReconciliationUpdates(data, input, actor));
  }, [actor, commitUpdates, data]);

  const classifyHistoricalPayment = useCallback(async (
    paymentId: string,
    method: PaymentMethod,
    moneyAccountId?: MoneyAccountId,
    cardId?: string,
  ) => {
    const payment = data.payments[paymentId];
    if (!payment || payment.reversedAt || !payment.historical) throw new Error("El pago histórico ya no está disponible.");
    if (method === "creditCard") {
      if (!cardId || !data.creditCards[cardId]) throw new Error("Selecciona la tarjeta usada para este pago histórico.");
    } else {
      const effectiveAccountId = method === "cash" ? CASH_ACCOUNT_ID : moneyAccountId;
      if (!effectiveAccountId || !data.moneyAccounts[effectiveAccountId]) {
        throw new Error(method === "cash" ? "Configura primero Efectivo." : "Selecciona la cuenta utilizada.");
      }
      moneyAccountId = effectiveAccountId;
    }
    await commitUpdates({
      [`payments/${paymentId}`]: {
        ...payment,
        reportingMethod: method,
        reportingMoneyAccountId: method === "creditCard" ? undefined : moneyAccountId,
        reportingCardId: method === "creditCard" ? cardId : undefined,
        reportingClassifiedAt: new Date().toISOString(),
        ...meta(payment),
      } satisfies Payment,
    });
  }, [commitUpdates, data.creditCards, data.moneyAccounts, data.payments, meta]);

  const reconcileSavingsAccounts = useCallback(async (input: SavingsAccountReconciliationInput) => {
    if (!navigator.onLine) throw new Error("Conéctate a internet antes de realizar esta reconciliación única.");
    await commitUpdates(buildSavingsAccountReconciliationUpdates(data, input, actor));
  }, [actor, commitUpdates, data]);

  return {
    generateRecurring,
    saveMonthlyTemplate,
    archiveMonthlyTemplate,
    createOneTimeMonthly,
    updateOneTimeMonthly,
    cancelMonthlyOccurrence,
    postponeObligation,
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
    saveBank,
    deleteEmptyBank,
    saveMoneyAccount,
    initializeCashAccount,
    initializeMoneyAccounts,
    adjustMoneyAccountBalance,
    transferMoney,
    saveLoan,
    adjustLoanBalance,
    reverseLoanAdjustment,
    reconcileStartingPoint,
    classifyHistoricalPayment,
    reconcileSavingsAccounts,
    updateSettings,
  };
};
