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
  /** Version 1 omitted expectedDate from pending income rows; version 2 fixes that boundary. */
  fingerprintVersion?: number;
  notes: string;
  /** Set when reported balances have been incorporated into the ledgers. */
  reconciledAt?: string;
  reconciledBy?: string;
  reconciliationTransactionIds?: string[];
}
export interface AuditChangeEntry {
  path: string;
  value: unknown;
}

/** New writes use AuditChangeEntry[]. Record is accepted for local migration of pre-2.2.1 queues. */
export type AuditSnapshot = AuditChangeEntry[] | Record<string, unknown>;

export interface ChangeAudit extends RecordMetadata {
  id: string;
  before: AuditSnapshot;
  after: AuditSnapshot;
  description: string;
}
export interface ManagedExpense extends Expense {
  version: number;
  createdBy: string;
  updatedBy: string;
  includedInOpeningBalance?: boolean;
}
