import type { Expense } from "../models/expense";
import type {
  CardStatement,
  Currency,
  FinancialData,
  MonthlyExpenseOccurrence,
  NonMonthlyOccurrence,
} from "../models/finance";
import { getExpenseTotalCents } from "./excel";
import { daysBetween, monthsBetween } from "./financeDates";
import { getBudgetCycleRange, getMonthKey, getQuincena, getQuincenaRange } from "./date";

export type DerivedStatus = "upcoming" | "dueSoon" | "dueToday" | "overdue" | "paid" | "cancelled";

export const deriveDatedStatus = (
  record: { status: string; dueDate: string },
  todayKey: string,
  dueSoonDays: number,
): DerivedStatus => {
  if (record.status === "paid") return "paid";
  if (record.status === "cancelled") return "cancelled";
  const difference = daysBetween(todayKey, record.dueDate);
  if (difference < 0) return "overdue";
  if (difference === 0) return "dueToday";
  if (difference <= dueSoonDays) return "dueSoon";
  return "upcoming";
};

export const statusLabel = (status: DerivedStatus): string => ({
  upcoming: "Próximo",
  dueSoon: "Vence pronto",
  dueToday: "Vence hoy",
  overdue: "Vencido",
  paid: "Pagado",
  cancelled: "Cancelado",
})[status];

export const getSavingsTransactionEffect = (type: string, amountMinor: number): number => {
  if (type === "deposit" || type === "transferIn") return Math.abs(amountMinor);
  if (type === "withdrawal" || type === "transferOut") return -Math.abs(amountMinor);
  return amountMinor;
};

export const getFundBalance = (data: FinancialData, fundId: string): number =>
  Object.values(data.savingsTransactions)
    .filter((transaction) => transaction.fundId === fundId && !transaction.reversedAt)
    .reduce((total, transaction) => total + getSavingsTransactionEffect(transaction.type, transaction.amountMinor), 0);

export const getFundAllocated = (data: FinancialData, fundId: string): number =>
  Object.values(data.savingsAllocations)
    .filter((allocation) => allocation.fundId === fundId && allocation.active && !allocation.releasedAt && !allocation.consumedAt)
    .reduce((total, allocation) => total + allocation.amountMinor, 0);

export const getObligationAllocations = (
  data: FinancialData,
  obligationType: "nonMonthly" | "cardStatement",
  obligationId: string,
) => Object.values(data.savingsAllocations).filter(
  (allocation) => allocation.obligationType === obligationType
    && allocation.obligationId === obligationId
    && allocation.active
    && !allocation.releasedAt
    && !allocation.consumedAt,
);

export const getObligationReserved = (
  data: FinancialData,
  obligationType: "nonMonthly" | "cardStatement",
  obligationId: string,
): number => getObligationAllocations(data, obligationType, obligationId)
  .reduce((total, allocation) => total + allocation.amountMinor, 0);

export type FundingStatus = "unfunded" | "partial" | "funded" | "overfunded";

export const getFundingStatus = (requiredMinor: number, reservedMinor: number): FundingStatus => {
  if (reservedMinor <= 0) return "unfunded";
  if (reservedMinor < requiredMinor) return "partial";
  if (reservedMinor === requiredMinor) return "funded";
  return "overfunded";
};

export const getCardTransactionEffect = (type: string, amountMinor: number): number => {
  if (type === "charge") return Math.abs(amountMinor);
  if (type === "payment" || type === "credit") return -Math.abs(amountMinor);
  return amountMinor;
};

export const getCardCurrentDebt = (data: FinancialData, cardId: string, currency: Currency): number => {
  const card = data.creditCards[cardId];
  if (!card) return 0;
  const opening = currency === "DOP" ? card.openingCurrentDebtDopMinor : card.openingCurrentDebtUsdMinor;
  return Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === cardId && transaction.currency === currency && !transaction.reversedAt)
    .reduce((total, transaction) => total + getCardTransactionEffect(transaction.type, transaction.amountMinor), opening);
};

export const getCardDebtAtDate = (data: FinancialData, cardId: string, currency: Currency, endDate: string): number => {
  const card = data.creditCards[cardId];
  if (!card || endDate < card.openingDate) return 0;
  const opening = currency === "DOP" ? card.openingCurrentDebtDopMinor : card.openingCurrentDebtUsdMinor;
  return Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === cardId
      && transaction.currency === currency
      && transaction.transactionDate <= endDate
      && !transaction.reversedAt)
    .reduce((total, transaction) => total + getCardTransactionEffect(transaction.type, transaction.amountMinor), opening);
};

export const getCardSavingsCoverage = (data: FinancialData, cardId: string, currency: Currency): number => {
  const chargesByObligation = new Map<string, number>();
  Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === cardId
      && transaction.currency === currency
      && transaction.type === "charge"
      && !transaction.reversedAt
      && transaction.linkedExpenseId)
    .forEach((transaction) => {
      const obligationId = transaction.linkedExpenseId as string;
      chargesByObligation.set(obligationId, (chargesByObligation.get(obligationId) || 0) + Math.abs(transaction.amountMinor));
    });
  return [...chargesByObligation.entries()].reduce(
    (total, [obligationId, charged]) => total + Math.min(charged, getObligationReserved(data, "nonMonthly", obligationId)),
    0,
  );
};

export const getStatementRemaining = (data: FinancialData, statement: CardStatement): number => {
  const amount = statement.correctedAmountMinor ?? statement.statementAmountMinor;
  const reductions = Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === statement.cardId
      && transaction.currency === statement.currency
      && !transaction.reversedAt
      && transaction.transactionDate > statement.cutDate
      && (transaction.type === "payment" || transaction.type === "credit"))
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  return Math.max(0, amount - reductions);
};

export const latestStatements = (data: FinancialData): CardStatement[] => {
  const byLedger = new Map<string, CardStatement>();
  Object.values(data.cardStatements).forEach((statement) => {
    const key = `${statement.cardId}:${statement.currency}`;
    const current = byLedger.get(key);
    if (!current || current.cutDate < statement.cutDate) byLedger.set(key, statement);
  });
  return [...byLedger.values()];
};

export const isInSelectedPeriod = (
  dateKey: string,
  monthKeys: Set<string>,
  quincena: 1 | 2 | "all",
): boolean => monthKeys.has(getMonthKey(dateKey)) && (quincena === "all" || getQuincena(dateKey) === quincena);

export const isPlannedOccurrenceInSelectedPeriod = (
  occurrence: { financialMonth: string; quincena: 1 | 2 },
  monthKeys: Set<string>,
  quincena: 1 | 2 | "all",
): boolean => monthKeys.has(occurrence.financialMonth)
  && (quincena === "all" || occurrence.quincena === quincena);

export interface CurrencyReportTotals {
  expectedIncome: number;
  receivedIncome: number;
  dailySpending: number;
  monthlyPaid: number;
  monthlyPending: number;
  nonMonthlyPaid: number;
  nonMonthlyPending: number;
  cardPayments: number;
  savingsDeposits: number;
  savingsWithdrawals: number;
  endingCardDebt: number;
  spending: number;
  cashFlow: number;
  planning: number;
}

export const calculateReportTotals = (
  data: FinancialData,
  expenses: Expense[],
  monthKeys: string[],
  quincena: 1 | 2 | "all",
  currency: Currency,
): CurrencyReportTotals => {
  const selected = new Set(monthKeys);
  const income = Object.values(data.incomeOccurrences).filter((item) =>
    item.currency === currency && isInSelectedPeriod(item.expectedDate, selected, quincena) && item.status !== "cancelled",
  );
  const monthly = Object.values(data.monthlyOccurrences).filter((item) =>
    item.currency === currency && isPlannedOccurrenceInSelectedPeriod(item, selected, quincena) && item.status !== "cancelled",
  );
  const nonMonthly = Object.values(data.nonMonthlyOccurrences).filter((item) =>
    item.currency === currency && isInSelectedPeriod(item.dueDate, selected, quincena) && item.status !== "cancelled",
  );
  const payments = Object.values(data.payments).filter((item) =>
    item.currency === currency && !item.reversedAt && isInSelectedPeriod(item.paidDate, selected, quincena),
  );
  const cardPayments = Object.values(data.cardTransactions).filter((item) =>
    item.currency === currency && item.type === "payment" && !item.reversedAt && isInSelectedPeriod(item.transactionDate, selected, quincena),
  );
  const manualCardSpending = Object.values(data.cardTransactions)
    .filter((item) => item.currency === currency
      && item.type === "charge"
      && !item.reversedAt
      && !item.linkedPaymentId
      && !item.linkedDailyExpenseId
      && isInSelectedPeriod(item.transactionDate, selected, quincena))
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const savingsTransactions = Object.values(data.savingsTransactions).filter((item) =>
    item.currency === currency && !item.reversedAt && isInSelectedPeriod(item.transactionDate, selected, quincena),
  );
  const dailySpending = currency === "DOP"
    ? expenses.filter((expense) => expense.status === "transferred" && isInSelectedPeriod(expense.occurredDate, selected, quincena))
      .reduce((total, expense) => total + getExpenseTotalCents(expense), 0)
    : 0;
  const expectedIncome = income.reduce((total, item) => total + item.expectedAmountMinor, 0);
  const receivedIncome = income.reduce((total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : 0), 0);
  const monthlyPaid = monthly.reduce((total, item) => total + (item.status === "paid" ? item.actualAmountMinor ?? item.expectedAmountMinor : 0), 0);
  const monthlyPending = monthly.reduce((total, item) => total + (item.status === "paid" ? 0 : item.expectedAmountMinor), 0);
  const nonMonthlyPaid = nonMonthly.reduce((total, item) => total + (item.status === "paid" ? item.actualAmountMinor ?? item.expectedAmountMinor : 0), 0);
  const nonMonthlyPending = nonMonthly.reduce((total, item) => total + (item.status === "paid" ? 0 : item.expectedAmountMinor), 0);
  const nonMonthlyUnfunded = nonMonthly.reduce(
    (total, item) => total + (item.status === "paid" ? 0 : getFutureOccurrenceFunding(data, item).missingMinor),
    0,
  );
  const cashPaidObligations = payments.filter((payment) => payment.method === "cash")
    .reduce((total, payment) => total + payment.amountMinor, 0);
  const cardPaymentTotal = cardPayments.reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const savingsDeposits = savingsTransactions
    .filter((transaction) => transaction.type === "deposit" || transaction.type === "transferIn")
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const savingsWithdrawals = savingsTransactions
    .filter((transaction) => transaction.type === "withdrawal" || transaction.type === "transferOut")
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const reportEndDate = monthKeys
    .map((monthKey) => quincena === "all" ? getBudgetCycleRange(monthKey).endDateKey : getQuincenaRange(monthKey, quincena).endDateKey)
    .sort()
    .at(-1) || "0000-00-00";
  const endingCardDebt = Object.keys(data.creditCards)
    .reduce((total, cardId) => total + getCardDebtAtDate(data, cardId, currency, reportEndDate), 0);
  const spending = dailySpending + monthlyPaid + nonMonthlyPaid + manualCardSpending;
  const cashFlow = receivedIncome - dailySpending - cashPaidObligations - cardPaymentTotal - savingsDeposits + savingsWithdrawals;
  const planningIncome = income.reduce(
    (total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.expectedAmountMinor),
    0,
  );
  const planning = planningIncome - dailySpending - monthlyPending - nonMonthlyUnfunded
    - latestStatements(data)
      .filter((statement) => statement.currency === currency && isInSelectedPeriod(statement.dueDate, selected, quincena))
      .reduce((total, statement) => total + getStatementRemaining(data, statement), 0);
  return {
    expectedIncome,
    receivedIncome,
    dailySpending,
    monthlyPaid,
    monthlyPending,
    nonMonthlyPaid,
    nonMonthlyPending,
    cardPayments: cardPaymentTotal,
    savingsDeposits,
    savingsWithdrawals,
    endingCardDebt,
    spending,
    cashFlow,
    planning,
  };
};

export const getFutureOccurrenceFunding = (data: FinancialData, occurrence: NonMonthlyOccurrence) => {
  const reservedMinor = getObligationReserved(data, "nonMonthly", occurrence.id);
  return {
    reservedMinor,
    missingMinor: Math.max(0, occurrence.expectedAmountMinor - reservedMinor),
    status: getFundingStatus(occurrence.expectedAmountMinor, reservedMinor),
  };
};

export const isNonMonthlyWarningActive = (
  occurrence: NonMonthlyOccurrence,
  todayKey: string,
  warningMonths: number,
): boolean => monthsBetween(todayKey, occurrence.dueDate) <= warningMonths;

export const monthlyVariance = (occurrence: MonthlyExpenseOccurrence): number =>
  occurrence.status === "paid" ? (occurrence.actualAmountMinor ?? occurrence.expectedAmountMinor) - occurrence.expectedAmountMinor : 0;
