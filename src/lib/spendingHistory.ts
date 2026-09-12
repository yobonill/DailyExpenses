import type { Expense, ExpensePaymentMethod } from "../models/expense";
import type { Currency, FinancialData, PaymentMethod } from "../models/finance";
import { getBudgetCycleRange, getMonthKey, getQuincena, getQuincenaRange, type Quincena } from "./date";

export type SpendingType = "extra" | "monthly" | "nonMonthly" | "purchaseGoal" | "bankFee" | "savings";
export type SpendingMethod = "card" | "bank" | "cash" | "unclassified";
export type SpendingNature = "expense" | "debt" | "savings";
export type SpendingSource = "expense" | "payment" | "cardTransaction" | "moneyTransaction" | "savingsTransaction";

export interface SpendingEntry {
  id: string;
  source: SpendingSource;
  sourceId: string;
  date: string;
  name: string;
  category: string;
  spendingType: SpendingType;
  nature: SpendingNature;
  method: SpendingMethod;
  currency: Currency;
  amountMinor: number;
  originalCurrency?: Currency;
  originalAmountMinor?: number;
  accountId?: string;
  cardId?: string;
  detailedMethod?: ExpensePaymentMethod | PaymentMethod;
  financialMonth?: string;
  quincena?: Quincena;
  dateIsApproximate?: boolean;
}

export interface SpendingRange {
  startDateKey: string;
  endDateKey: string;
}

export interface SpendingTotals {
  allocated: Record<Currency, number>;
  total: Record<Currency, number>;
  real: Record<Currency, number>;
  bank: Record<Currency, number>;
  cash: Record<Currency, number>;
  card: Record<Currency, number>;
  unclassified: Record<Currency, number>;
  debt: Record<Currency, number>;
  savings: Record<Currency, number>;
}

const UNCATEGORIZED = "Sin categoría";
const BANK_FEES = "Comisiones bancarias";

const spendingNature = (category: string | undefined, loanId?: string): SpendingNature => {
  if (loanId || category === "Deudas y préstamos") return "debt";
  if (category === "Ahorros") return "savings";
  return "expense";
};

const expenseMethod = (method: ExpensePaymentMethod | undefined): SpendingMethod => {
  if (method === "creditCard") return "card";
  if (method === "cash" || !method) return "cash";
  return "bank";
};

const paymentMethod = (method: PaymentMethod): SpendingMethod => {
  if (method === "creditCard") return "card";
  if (method === "cash") return "cash";
  return "bank";
};

const positive = (value: number | undefined): number => Math.max(0, Math.round(value || 0));

export const buildSpendingHistory = (data: FinancialData, expenses: Expense[]): SpendingEntry[] => {
  const entries: SpendingEntry[] = [];
  const activeFeesByExpense = new Set<string>();
  const activeFeesByPayment = new Set<string>();
  const purchasedGoalByExpense = new Map(
    Object.values(data.purchaseGoals)
      .filter((goal) => goal.status === "purchased" && goal.linkedDailyExpenseId)
      .map((goal) => [goal.linkedDailyExpenseId as string, goal]),
  );

  Object.values(data.moneyTransactions)
    .filter((transaction) => transaction.type === "fee" && transaction.direction === "out" && !transaction.reversedAt)
    .forEach((transaction) => {
      if (transaction.linkedDailyExpenseId) activeFeesByExpense.add(transaction.linkedDailyExpenseId);
      if (transaction.linkedPaymentId) activeFeesByPayment.add(transaction.linkedPaymentId);
      entries.push({
        id: `moneyTransaction:${transaction.id}`,
        source: "moneyTransaction",
        sourceId: transaction.id,
        date: transaction.transactionDate,
        name: transaction.description || "Comisión bancaria",
        category: BANK_FEES,
        spendingType: "bankFee",
        nature: "expense",
        method: data.moneyAccounts[transaction.accountId]?.kind === "cash" ? "cash" : "bank",
        currency: transaction.currency,
        amountMinor: positive(transaction.amountMinor),
        accountId: transaction.accountId,
        detailedMethod: "bankTransfer",
      });
    });

  Object.values(data.savingsTransactions)
    .filter((transaction) => transaction.type === "deposit"
      && !transaction.reversedAt
      && transaction.notes !== "Saldo inicial"
      && !transaction.linkedPaymentId)
    .forEach((transaction) => {
      const fund = data.savingsFunds[transaction.fundId];
      const account = fund?.moneyAccountId ? data.moneyAccounts[fund.moneyAccountId] : undefined;
      entries.push({
        id: `savingsTransaction:${transaction.id}`,
        source: "savingsTransaction",
        sourceId: transaction.id,
        date: transaction.transactionDate,
        name: `Ahorro · ${fund?.name || "Fondo"}`,
        category: "Ahorros",
        spendingType: "savings",
        nature: "savings",
        method: account ? account.kind === "cash" ? "cash" : "bank" : "unclassified",
        currency: transaction.currency,
        amountMinor: positive(transaction.amountMinor),
        accountId: account?.id,
        detailedMethod: account?.kind === "cash" ? "cash" : account ? "bankTransfer" : undefined,
      });
    });

  expenses
    .filter((expense) => !expense.deletedAt && expense.status !== "pending")
    .forEach((expense) => {
      const goal = purchasedGoalByExpense.get(expense.id);
      const method = expenseMethod(expense.paymentMethod);
      const currency: Currency = expense.currency === "USD" ? "USD" : "DOP";
      entries.push({
        id: `expense:${expense.id}`,
        source: "expense",
        sourceId: expense.id,
        date: expense.occurredDate,
        name: expense.name,
        category: goal?.category || expense.category || UNCATEGORIZED,
        spendingType: goal ? "purchaseGoal" : "extra",
        nature: spendingNature(goal?.category || expense.category),
        method,
        currency,
        amountMinor: positive(expense.unitPriceCents * expense.quantity),
        accountId: method === "card" ? undefined : expense.moneyAccountId,
        cardId: method === "card" ? Object.values(data.cardTransactions)
          .find((transaction) => transaction.linkedDailyExpenseId === expense.id && !transaction.reversedAt)?.cardId
          : undefined,
        detailedMethod: expense.paymentMethod || "cash",
      });
      if (positive(expense.transferFeeCents) > 0 && !activeFeesByExpense.has(expense.id)) {
        entries.push({
          id: `expenseFee:${expense.id}`,
          source: "expense",
          sourceId: expense.id,
          date: expense.occurredDate,
          name: `Comisión bancaria · ${expense.name}`,
          category: BANK_FEES,
          spendingType: "bankFee",
          nature: "expense",
          method: "bank",
          currency: "DOP",
          amountMinor: positive(expense.transferFeeCents),
          accountId: expense.moneyAccountId,
          detailedMethod: "transfer",
        });
      }
    });

  Object.values(data.payments)
    .filter((payment) => !payment.reversedAt)
    .forEach((payment) => {
      const occurrence = payment.sourceType === "monthly"
        ? data.monthlyOccurrences[payment.sourceId]
        : data.nonMonthlyOccurrences[payment.sourceId];
      const goal = payment.sourceType === "nonMonthly" && occurrence && "sourcePurchaseGoalId" in occurrence && occurrence.sourcePurchaseGoalId
        ? data.purchaseGoals[occurrence.sourcePurchaseGoalId]
        : undefined;
      const historicalMethod = payment.reportingMethod
        || (payment.historicalSource === "creditCardOpeningBalance" ? "creditCard" : undefined);
      const method = payment.historical
        ? historicalMethod ? paymentMethod(historicalMethod) : "unclassified"
        : paymentMethod(payment.method);
      const settlesUsdWithDop = method !== "card"
        && method !== "unclassified"
        && payment.currency === "USD"
        && positive(payment.settlementAmountDopMinor) > 0;
      const hasFinancialPeriod = payment.historical
        && occurrence
        && "financialMonth" in occurrence
        && typeof occurrence.financialMonth === "string"
        && (occurrence.quincena === 1 || occurrence.quincena === 2);
      const historicalRange = hasFinancialPeriod
        ? getQuincenaRange(occurrence.financialMonth, occurrence.quincena)
        : undefined;
      const category = goal?.category || occurrence?.category || UNCATEGORIZED;
      const amountMinor = settlesUsdWithDop ? positive(payment.settlementAmountDopMinor) : positive(payment.amountMinor);
      const baseEntry: Omit<SpendingEntry, "id" | "name" | "nature" | "amountMinor"> = {
        source: "payment",
        sourceId: payment.id,
        date: historicalRange?.startDateKey || payment.paidDate,
        category,
        spendingType: goal ? "purchaseGoal" : payment.sourceType,
        method,
        currency: settlesUsdWithDop ? "DOP" : payment.currency,
        originalCurrency: settlesUsdWithDop ? "USD" : undefined,
        accountId: payment.historical ? payment.reportingMoneyAccountId : payment.moneyAccountId,
        cardId: payment.historical ? payment.reportingCardId || payment.cardId : payment.cardId,
        detailedMethod: payment.historical ? historicalMethod : payment.method,
        financialMonth: hasFinancialPeriod ? occurrence.financialMonth : undefined,
        quincena: hasFinancialPeriod ? occurrence.quincena : undefined,
        dateIsApproximate: Boolean(payment.historical),
      };
      const loanTransaction = payment.loanTransactionId ? data.loanTransactions[payment.loanTransactionId] : undefined;
      if (loanTransaction && !loanTransaction.reversedAt) {
        const originalTotal = positive(payment.amountMinor);
        const originalPrincipal = Math.min(originalTotal, positive(loanTransaction.principalMinor));
        const principalMinor = originalTotal > 0 ? Math.round(amountMinor * originalPrincipal / originalTotal) : 0;
        const expenseMinor = Math.max(0, amountMinor - principalMinor);
        if (principalMinor > 0) entries.push({
          ...baseEntry,
          id: `payment:${payment.id}:principal`,
          name: `${occurrence?.name || "Pago de préstamo"} · Capital`,
          nature: "debt",
          amountMinor: principalMinor,
          originalAmountMinor: settlesUsdWithDop ? originalPrincipal : undefined,
        });
        if (expenseMinor > 0) entries.push({
          ...baseEntry,
          id: `payment:${payment.id}:cost`,
          name: `${occurrence?.name || "Pago de préstamo"} · Intereses y cargos`,
          nature: "expense",
          amountMinor: expenseMinor,
          originalAmountMinor: settlesUsdWithDop ? Math.max(0, originalTotal - originalPrincipal) : undefined,
        });
      } else {
        entries.push({
          ...baseEntry,
          id: `payment:${payment.id}`,
          name: occurrence?.name || "Pago registrado",
          nature: spendingNature(category, payment.loanId || occurrence?.loanId),
          amountMinor,
          originalAmountMinor: settlesUsdWithDop ? positive(payment.amountMinor) : undefined,
        });
      }
      if (positive(payment.transferFeeMinor) > 0 && !activeFeesByPayment.has(payment.id)) {
        entries.push({
          id: `paymentFee:${payment.id}`,
          source: "payment",
          sourceId: payment.id,
          date: payment.paidDate,
          name: `Comisión bancaria · ${occurrence?.name || "Pago"}`,
          category: BANK_FEES,
          spendingType: "bankFee",
          nature: "expense",
          method: "bank",
          currency: "DOP",
          amountMinor: positive(payment.transferFeeMinor),
          accountId: payment.moneyAccountId,
          detailedMethod: "bankTransfer",
        });
      }
    });

  Object.values(data.cardTransactions)
    .filter((transaction) => transaction.type === "charge"
      && transaction.affectsCurrentBalance !== false
      && !transaction.reversedAt
      && !transaction.linkedPaymentId
      && !transaction.linkedDailyExpenseId)
    .forEach((transaction) => {
      const goal = transaction.linkedPurchaseGoalId
        ? data.purchaseGoals[transaction.linkedPurchaseGoalId]
        : undefined;
      entries.push({
        id: `cardTransaction:${transaction.id}`,
        source: "cardTransaction",
        sourceId: transaction.id,
        date: transaction.transactionDate,
        name: transaction.description,
        category: goal?.category || transaction.category || UNCATEGORIZED,
        spendingType: goal ? "purchaseGoal" : "extra",
        nature: spendingNature(goal?.category || transaction.category),
        method: "card",
        currency: transaction.currency,
        amountMinor: positive(transaction.amountMinor),
        cardId: transaction.cardId,
        detailedMethod: "creditCard",
      });
    });

  return entries
    .filter((entry) => entry.amountMinor > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
};

export const isEntryInRange = (entry: SpendingEntry, range: SpendingRange): boolean =>
  entry.date >= range.startDateKey && entry.date <= range.endDateKey;

export const getSpendingTotals = (entries: SpendingEntry[]): SpendingTotals => {
  const totals: SpendingTotals = {
    allocated: { DOP: 0, USD: 0 },
    total: { DOP: 0, USD: 0 },
    real: { DOP: 0, USD: 0 },
    bank: { DOP: 0, USD: 0 },
    cash: { DOP: 0, USD: 0 },
    card: { DOP: 0, USD: 0 },
    unclassified: { DOP: 0, USD: 0 },
    debt: { DOP: 0, USD: 0 },
    savings: { DOP: 0, USD: 0 },
  };
  entries.forEach((entry) => {
    totals.allocated[entry.currency] += entry.amountMinor;
    if (entry.nature === "debt") {
      totals.debt[entry.currency] += entry.amountMinor;
      return;
    }
    if (entry.nature === "savings") {
      totals.savings[entry.currency] += entry.amountMinor;
      return;
    }
    totals.total[entry.currency] += entry.amountMinor;
    totals[entry.method][entry.currency] += entry.amountMinor;
    if (entry.method === "bank" || entry.method === "cash") totals.real[entry.currency] += entry.amountMinor;
  });
  return totals;
};

const dateKeyToUtc = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const utcToDateKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

const shiftDate = (dateKey: string, days: number): string => {
  const date = dateKeyToUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToDateKey(date);
};

export const getPreviousSpendingRange = (
  current: SpendingRange,
  mode: "cycle" | "custom",
): SpendingRange => {
  const previousEnd = shiftDate(current.startDateKey, -1);
  if (mode === "cycle") {
    const previousMonth = getMonthKey(previousEnd);
    const previousQuincena = getQuincena(previousEnd);
    const currentMonth = getMonthKey(current.startDateKey);
    const fullCurrentCycle = getBudgetCycleRange(currentMonth);
    if (current.startDateKey === fullCurrentCycle.startDateKey && current.endDateKey === fullCurrentCycle.endDateKey) {
      return getBudgetCycleRange(previousMonth);
    }
    return getQuincenaRange(previousMonth, previousQuincena as Quincena);
  }
  const durationDays = Math.round((dateKeyToUtc(current.endDateKey).getTime() - dateKeyToUtc(current.startDateKey).getTime()) / 86_400_000) + 1;
  return { startDateKey: shiftDate(previousEnd, -(durationDays - 1)), endDateKey: previousEnd };
};
