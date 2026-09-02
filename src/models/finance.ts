import type { SyncState } from "./expense";

export type Currency = "DOP" | "USD";
export type FinancialStatus = "upcoming" | "paid" | "cancelled";
export type RecurrenceKind = "once" | "monthly" | "months" | "years";
export type PaymentMethod = "cash" | "creditCard";
export type PurchaseGoalPriority = "low" | "medium" | "high";
export type PurchaseGoalStatus = "active" | "scheduled" | "purchased" | "discarded";

export interface RecordMetadata {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  archivedAt?: string;
}

export interface DueDateRule {
  kind: "day" | "lastDay";
  day?: number;
}

export interface MonthlyExpenseTemplate extends RecordMetadata {
  id: string;
  name: string;
  category?: string;
  estimatedAmountMinor: number;
  currency: Currency;
  dueRule: DueDateRule;
  plannedQuincena?: 1 | 2;
  variableAmount: boolean;
  canPayWithCard: boolean;
  active: boolean;
  notes?: string;
  excelRowLabel?: string;
}

export interface MonthlyExpenseOccurrence extends RecordMetadata {
  id: string;
  templateId?: string;
  name: string;
  category?: string;
  expectedAmountMinor: number;
  actualAmountMinor?: number;
  currency: Currency;
  dueDate: string;
  financialMonth: string;
  quincena: 1 | 2;
  status: FinancialStatus;
  paymentId?: string;
  canPayWithCard: boolean;
  oneTime: boolean;
  notes?: string;
  excelRowLabel?: string;
  cancelledAt?: string;
  cancelledReason?: string;
}

export interface Payment extends RecordMetadata {
  id: string;
  sourceType: "monthly" | "nonMonthly";
  sourceId: string;
  amountMinor: number;
  currency: Currency;
  paidDate: string;
  method: PaymentMethod;
  cardId?: string;
  cardTransactionId?: string;
  savingsTransactionIds?: string[];
  notes?: string;
  reversedAt?: string;
}

export interface IncomeTemplate extends RecordMetadata {
  id: string;
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

export interface IncomeOccurrence extends RecordMetadata {
  id: string;
  templateId?: string;
  name: string;
  incomeType: "salary" | "recurringOther" | "oneTime";
  expectedAmountMinor: number;
  actualAmountMinor?: number;
  currency: Currency;
  expectedDate: string;
  receivedDate?: string;
  financialMonth: string;
  quincena: 1 | 2;
  status: "expected" | "received" | "cancelled";
  oneTime: boolean;
  notes?: string;
  excelRowLabel?: string;
  exportExpectedWhenPending: boolean;
}

export interface NonMonthlyExpense extends RecordMetadata {
  id: string;
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
  sourcePurchaseGoalId?: string;
}

export interface NonMonthlyOccurrence extends RecordMetadata {
  id: string;
  planId: string;
  name: string;
  category?: string;
  expectedAmountMinor: number;
  actualAmountMinor?: number;
  currency: Currency;
  dueDate: string;
  status: FinancialStatus;
  paymentId?: string;
  canPayWithCard: boolean;
  notes?: string;
  sourcePurchaseGoalId?: string;
  completedAt?: string;
}

export interface SavingsFund extends RecordMetadata {
  id: string;
  name: string;
  currency: Currency;
  targetAmountMinor?: number;
  targetDate?: string;
  active: boolean;
  notes?: string;
}

export interface SavingsTransaction extends RecordMetadata {
  id: string;
  fundId: string;
  type: "deposit" | "withdrawal" | "correction" | "transferIn" | "transferOut";
  amountMinor: number;
  currency: Currency;
  transactionDate: string;
  transferId?: string;
  linkedPaymentId?: string;
  linkedCardTransactionId?: string;
  notes?: string;
  reversedAt?: string;
}

export interface SavingsAllocation extends RecordMetadata {
  id: string;
  fundId: string;
  obligationType: "nonMonthly" | "cardStatement" | "purchaseGoal";
  obligationId: string;
  amountMinor: number;
  currency: Currency;
  active: boolean;
  releasedAt?: string;
  consumedAt?: string;
  linkedCardTransactionId?: string;
}

export interface PurchaseGoal extends RecordMetadata {
  id: string;
  name: string;
  estimatedAmountMinor: number;
  currency: Currency;
  priority: PurchaseGoalPriority;
  category?: string;
  notes?: string;
  status: PurchaseGoalStatus;
  scheduledPlanId?: string;
  scheduledOccurrenceId?: string;
  actualAmountMinor?: number;
  actualPaymentDopMinor?: number;
  purchaseMethod?: PaymentMethod;
  linkedDailyExpenseId?: string;
  linkedCardTransactionId?: string;
  purchasedAt?: string;
  discardedAt?: string;
}

export interface CreditCard extends RecordMetadata {
  id: string;
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

export interface CardTransaction extends RecordMetadata {
  id: string;
  cardId: string;
  currency: Currency;
  type: "charge" | "payment" | "credit" | "adjustment";
  amountMinor: number;
  /** False when a historical movement is already reflected in the opening current debt snapshot. */
  affectsCurrentBalance?: boolean;
  /**
   * Actual DOP amount withdrawn when a USD card balance is paid.
   * The USD amount remains authoritative for reducing the card debt.
   */
  settlementAmountDopMinor?: number;
  transactionDate: string;
  description: string;
  linkedPaymentId?: string;
  linkedExpenseId?: string;
  linkedDailyExpenseId?: string;
  linkedPurchaseGoalId?: string;
  notes?: string;
  reversedAt?: string;
}

export interface CardStatement extends RecordMetadata {
  id: string;
  cardId: string;
  currency: Currency;
  cycleStartDate: string;
  cutDate: string;
  dueDate: string;
  statementAmountMinor: number;
  /** Exact minimum payment printed by the bank on this statement. */
  minimumPaymentMinor?: number;
  status: "open" | "paid" | "corrected";
  correctedAmountMinor?: number;
}

/**
 * Total card payment the user intends to make during one quincena.
 * The app has one working card; DOP and USD debt remain separate ledgers.
 */
export interface CardPaymentPlan extends RecordMetadata {
  id: string;
  financialMonth: string;
  quincena: 1 | 2;
  plannedDopMinor: number;
  plannedUsdMinor: number;
}

export interface AppSettings {
  dueSoonDaysMonthly: number;
  dueSoonDaysCards: number;
  nonMonthlyWarningMonths: number;
  /** Informational rate used only to estimate USD commitments in DOP projections. */
  estimatedUsdToDopRate: number;
  updatedAt: string;
  updatedBy: string;
}

export interface FinancialData {
  schemaVersion: 1;
  monthlyTemplates: Record<string, MonthlyExpenseTemplate>;
  monthlyOccurrences: Record<string, MonthlyExpenseOccurrence>;
  payments: Record<string, Payment>;
  incomeTemplates: Record<string, IncomeTemplate>;
  incomeOccurrences: Record<string, IncomeOccurrence>;
  nonMonthlyExpenses: Record<string, NonMonthlyExpense>;
  nonMonthlyOccurrences: Record<string, NonMonthlyOccurrence>;
  purchaseGoals: Record<string, PurchaseGoal>;
  savingsFunds: Record<string, SavingsFund>;
  savingsTransactions: Record<string, SavingsTransaction>;
  savingsAllocations: Record<string, SavingsAllocation>;
  creditCards: Record<string, CreditCard>;
  cardTransactions: Record<string, CardTransaction>;
  cardStatements: Record<string, CardStatement>;
  cardPaymentPlans: Record<string, CardPaymentPlan>;
  settings: AppSettings;
  lastBackupAt?: string;
}

export interface FinancialPendingOperation {
  id: string;
  createdAt: string;
  updates: Record<string, unknown>;
  replaceRoot?: FinancialData;
}

export interface LocalFinancialState {
  data: FinancialData;
  pendingOperations: FinancialPendingOperation[];
}

export interface UseFinancialDataResult {
  data: FinancialData;
  ready: boolean;
  syncState: SyncState;
  syncMessage: string;
  pendingCount: number;
  commitUpdates: (updates: Record<string, unknown>) => Promise<void>;
  replaceData: (data: FinancialData) => Promise<void>;
  retrySync: () => Promise<void>;
}
