import type { Currency, RecordMetadata } from "./finance";
import type { Expense } from "./expense";

export interface BalanceIssue extends RecordMetadata {
  id: string;
  accountId?: string;
  cardId?: string;
  currency: Currency;
  date: string;
  description: string;
  differenceMinor: number;
  beforeMinor: number;
  afterMinor: number;
  movementPaths: string[];
  status: "pending" | "reviewed";
  resolution?: string;
}
export interface ClosingBalance {
  key: string;
  kind: "account" | "card";
  id: string;
  name: string;
  currency: Currency;
  calculatedMinor: number;
  reportedMinor?: number;
  reservedMinor: number;
  unavailable: boolean;
}
export interface CycleClosing extends RecordMetadata {
  id: string;
  financialMonth: string;
  quincena: 1 | 2;
  cutoff: string;
  revision: number;
  status: "reconciled" | "differences" | "incomplete";
  balances: ClosingBalance[];
  fingerprint: string;
  notes: string;
}
export interface ChangeAudit extends RecordMetadata {
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  description: string;
}
export interface ManagedExpense extends Expense {
  version: number;
  createdBy: string;
  updatedBy: string;
  includedInOpeningBalance?: boolean;
}
