import type { Expense } from "../models/expense";
import type {
  CardTransaction,
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
  obligationType: "nonMonthly" | "cardStatement" | "purchaseGoal",
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
  obligationType: "nonMonthly" | "cardStatement" | "purchaseGoal",
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

export const getUsdPaymentEffectiveRate = (transaction: CardTransaction): number | null => {
  if (transaction.type !== "payment"
    || transaction.currency !== "USD"
    || transaction.amountMinor <= 0
    || !transaction.settlementAmountDopMinor
    || transaction.settlementAmountDopMinor <= 0) return null;
  return transaction.settlementAmountDopMinor / transaction.amountMinor;
};

const getCardPaymentAmountForCurrency = (
  transaction: CardTransaction,
  currency: Currency,
): number => {
  if (transaction.type !== "payment" || transaction.reversedAt) return 0;
  if (currency === "DOP") {
    if (transaction.currency === "DOP") return Math.abs(transaction.amountMinor);
    return Math.abs(transaction.settlementAmountDopMinor || 0);
  }
  return transaction.currency === "USD" ? Math.abs(transaction.amountMinor) : 0;
};

const getCardPaymentCashOutflow = (
  transaction: CardTransaction,
  currency: Currency,
): number => {
  if (currency === "DOP") return getCardPaymentAmountForCurrency(transaction, "DOP");
  if (transaction.currency !== "USD" || transaction.settlementAmountDopMinor) return 0;
  return getCardPaymentAmountForCurrency(transaction, "USD");
};

export type CardMinimumPaymentStatus = "notConfigured" | "pending" | "dueSoon" | "dueToday" | "overdue" | "paidOnTime" | "paidLate";

export interface CardMinimumPaymentProgress {
  configured: boolean;
  requiredMinor: number;
  paidMinor: number;
  remainingMinor: number;
  satisfiedDate?: string;
  status: CardMinimumPaymentStatus;
}

export const getCardMinimumPaymentProgress = (
  data: FinancialData,
  statement: CardStatement,
  todayKey: string,
  dueSoonDays: number,
): CardMinimumPaymentProgress => {
  const requiredMinor = Math.max(0, statement.minimumPaymentMinor || 0);
  if (requiredMinor <= 0) {
    return { configured: false, requiredMinor: 0, paidMinor: 0, remainingMinor: 0, status: "notConfigured" };
  }
  const payments = Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === statement.cardId
      && transaction.currency === statement.currency
      && transaction.type === "payment"
      && !transaction.reversedAt
      && transaction.transactionDate > statement.cutDate)
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.createdAt.localeCompare(b.createdAt));
  let paidMinor = 0;
  let satisfiedDate: string | undefined;
  for (const payment of payments) {
    paidMinor += Math.abs(payment.amountMinor);
    if (!satisfiedDate && paidMinor >= requiredMinor) satisfiedDate = payment.transactionDate;
  }
  const remainingMinor = Math.max(0, requiredMinor - paidMinor);
  if (remainingMinor <= 0) {
    return {
      configured: true,
      requiredMinor,
      paidMinor,
      remainingMinor,
      satisfiedDate,
      status: satisfiedDate && satisfiedDate > statement.dueDate ? "paidLate" : "paidOnTime",
    };
  }
  const difference = daysBetween(todayKey, statement.dueDate);
  const status: CardMinimumPaymentStatus = difference < 0
    ? "overdue"
    : difference === 0
      ? "dueToday"
      : difference <= dueSoonDays
        ? "dueSoon"
        : "pending";
  return { configured: true, requiredMinor, paidMinor, remainingMinor, status };
};

export const minimumPaymentStatusLabel = (status: CardMinimumPaymentStatus): string => ({
  notConfigured: "Mínimo sin registrar",
  pending: "Mínimo pendiente",
  dueSoon: "Mínimo vence pronto",
  dueToday: "Mínimo vence hoy",
  overdue: "Mínimo vencido",
  paidOnTime: "Mínimo pagado",
  paidLate: "Mínimo pagado tarde",
})[status];

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
  const chargesByObligation = new Map<string, { type: "nonMonthly" | "purchaseGoal"; id: string; charged: number }>();
  Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === cardId
      && transaction.currency === currency
      && transaction.type === "charge"
      && !transaction.reversedAt
      && (transaction.linkedExpenseId || transaction.linkedPurchaseGoalId))
    .forEach((transaction) => {
      const type = transaction.linkedExpenseId ? "nonMonthly" : "purchaseGoal";
      const id = (transaction.linkedExpenseId || transaction.linkedPurchaseGoalId) as string;
      const key = `${type}:${id}`;
      const current = chargesByObligation.get(key);
      chargesByObligation.set(key, { type, id, charged: (current?.charged || 0) + Math.abs(transaction.amountMinor) });
    });
  const reservedCoverage = [...chargesByObligation.values()].reduce(
    (total, item) => total + Math.min(item.charged, getObligationReserved(data, item.type, item.id)),
    0,
  );
  return Math.min(reservedCoverage, Math.max(0, getCardCurrentDebt(data, cardId, currency)));
};

export const getPurchaseGoalReserved = (data: FinancialData, goalId: string): number =>
  getObligationReserved(data, "purchaseGoal", goalId);

export const getCardPaymentPlanId = (financialMonth: string, quincena: 1 | 2): string =>
  `${financialMonth}_Q${quincena}`;

export interface CardPaymentProjection {
  plannedDopMinor: number;
  plannedUsdMinor: number;
  paidDopDebtMinor: number;
  paidUsdDebtMinor: number;
  actualCashOutflowDopMinor: number;
  remainingPlannedDopMinor: number;
  remainingPlannedUsdMinor: number;
  estimatedRemainingUsdDopMinor: number;
  minimumDueDopMinor: number;
  minimumDueUsdMinor: number;
  remainingMinimumDopMinor: number;
  remainingMinimumUsdMinor: number;
  minimumTopUpDopMinor: number;
  minimumTopUpUsdMinor: number;
  estimatedMinimumTopUpUsdDopMinor: number;
  unconfiguredMinimumCount: number;
  totalCashCommitmentDopMinor: number;
}

/**
 * Projects the payment the user explicitly planned for the card. When the bank's
 * exact minimum payment is available for a statement due in the selected period,
 * that unpaid minimum becomes the floor. The full statement remains informational.
 */
export const calculateCardPaymentProjection = (
  data: FinancialData,
  monthKeys: string[],
  quincena: 1 | 2 | "all",
  estimatedUsdToDopRate: number,
): CardPaymentProjection => {
  const selectedMonths = new Set(monthKeys);
  const selectedPlans = Object.values(data.cardPaymentPlans).filter((plan) =>
    selectedMonths.has(plan.financialMonth) && (quincena === "all" || plan.quincena === quincena),
  );
  const payments = Object.values(data.cardTransactions).filter((transaction) =>
    transaction.type === "payment"
      && !transaction.reversedAt
      && isInSelectedPeriod(transaction.transactionDate, selectedMonths, quincena),
  );
  const plannedDopMinor = selectedPlans.reduce((total, plan) => total + plan.plannedDopMinor, 0);
  const plannedUsdMinor = selectedPlans.reduce((total, plan) => total + plan.plannedUsdMinor, 0);
  const paidDopDebtMinor = payments
    .filter((transaction) => transaction.currency === "DOP")
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const paidUsdDebtMinor = payments
    .filter((transaction) => transaction.currency === "USD")
    .reduce((total, transaction) => total + Math.abs(transaction.amountMinor), 0);
  const actualCashOutflowDopMinor = payments.reduce(
    (total, transaction) => total + getCardPaymentCashOutflow(transaction, "DOP"),
    0,
  );
  const remainingPlannedDopMinor = Math.max(0, plannedDopMinor - paidDopDebtMinor);
  const remainingPlannedUsdMinor = Math.max(0, plannedUsdMinor - paidUsdDebtMinor);
  const estimatedRemainingUsdDopMinor = estimatedUsdToDopRate > 0
    ? Math.round(remainingPlannedUsdMinor * estimatedUsdToDopRate)
    : 0;
  const dueStatements = Object.values(data.cardStatements).filter((statement) =>
    isInSelectedPeriod(statement.dueDate, selectedMonths, quincena)
      && (statement.correctedAmountMinor ?? statement.statementAmountMinor) > 0,
  );
  const minimumProgress = dueStatements.map((statement) => ({
    statement,
    progress: getCardMinimumPaymentProgress(data, statement, statement.dueDate, data.settings.dueSoonDaysCards),
  }));
  const configuredMinimums = minimumProgress.filter(({ progress }) => progress.configured);
  const minimumDueDopMinor = configuredMinimums
    .filter(({ statement }) => statement.currency === "DOP")
    .reduce((total, { progress }) => total + progress.requiredMinor, 0);
  const minimumDueUsdMinor = configuredMinimums
    .filter(({ statement }) => statement.currency === "USD")
    .reduce((total, { progress }) => total + progress.requiredMinor, 0);
  const remainingMinimumDopMinor = configuredMinimums
    .filter(({ statement }) => statement.currency === "DOP")
    .reduce((total, { progress }) => total + progress.remainingMinor, 0);
  const remainingMinimumUsdMinor = configuredMinimums
    .filter(({ statement }) => statement.currency === "USD")
    .reduce((total, { progress }) => total + progress.remainingMinor, 0);
  const minimumTopUpDopMinor = Math.max(0, remainingMinimumDopMinor - remainingPlannedDopMinor);
  const minimumTopUpUsdMinor = Math.max(0, remainingMinimumUsdMinor - remainingPlannedUsdMinor);
  const estimatedMinimumTopUpUsdDopMinor = estimatedUsdToDopRate > 0
    ? Math.round(minimumTopUpUsdMinor * estimatedUsdToDopRate)
    : 0;
  return {
    plannedDopMinor,
    plannedUsdMinor,
    paidDopDebtMinor,
    paidUsdDebtMinor,
    actualCashOutflowDopMinor,
    remainingPlannedDopMinor,
    remainingPlannedUsdMinor,
    estimatedRemainingUsdDopMinor,
    minimumDueDopMinor,
    minimumDueUsdMinor,
    remainingMinimumDopMinor,
    remainingMinimumUsdMinor,
    minimumTopUpDopMinor,
    minimumTopUpUsdMinor,
    estimatedMinimumTopUpUsdDopMinor,
    unconfiguredMinimumCount: minimumProgress.filter(({ progress }) => !progress.configured).length,
    totalCashCommitmentDopMinor: actualCashOutflowDopMinor
      + remainingPlannedDopMinor
      + minimumTopUpDopMinor
      + estimatedRemainingUsdDopMinor
      + estimatedMinimumTopUpUsdDopMinor,
  };
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
  dailyCashSpending: number;
  dailyCardSpending: number;
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
  planningIncome: number;
  planningCommitments: number;
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
    item.type === "payment" && !item.reversedAt && isInSelectedPeriod(item.transactionDate, selected, quincena),
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
  const dailyExpenses = expenses.filter((expense) => !expense.deletedAt
    && (expense.currency === "USD" ? "USD" : "DOP") === currency
    && isInSelectedPeriod(expense.occurredDate, selected, quincena));
  const dailySpending = dailyExpenses.reduce((total, expense) => total + getExpenseTotalCents(expense), 0);
  const dailyCardSpending = dailyExpenses
    .filter((expense) => expense.paymentMethod === "creditCard")
    .reduce((total, expense) => total + getExpenseTotalCents(expense), 0);
  const dailyCashSpending = dailySpending - dailyCardSpending;
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
  const cardPaymentTotal = cardPayments.reduce(
    (total, transaction) => total + getCardPaymentAmountForCurrency(transaction, currency),
    0,
  );
  const cardPaymentCashOutflow = cardPayments.reduce(
    (total, transaction) => total + getCardPaymentCashOutflow(transaction, currency),
    0,
  );
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
  const cashFlow = receivedIncome - dailyCashSpending - cashPaidObligations - cardPaymentCashOutflow - savingsDeposits + savingsWithdrawals;
  const planningIncome = income.reduce(
    (total, item) => total + (item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.expectedAmountMinor),
    0,
  );
  // Cash-paid fixed obligations must remain in the selected period's budget.
  // Card debt is not a fixed commitment: the Dashboard subtracts only the
  // payment explicitly planned for the selected period.
  const planningCommitments = cashPaidObligations + monthlyPending + nonMonthlyUnfunded;
  const planning = planningIncome - dailyCashSpending - planningCommitments;
  return {
    expectedIncome,
    receivedIncome,
    dailySpending,
    dailyCashSpending,
    dailyCardSpending,
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
    planningIncome,
    planningCommitments,
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
