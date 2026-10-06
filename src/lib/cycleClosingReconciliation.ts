import type { CardTransaction, FinancialData, MoneyTransaction, RecordMetadata } from "../models/finance";
import type { ClosingBalance, CycleClosing } from "../models/review";
import { applyFinancialUpdates } from "./financialState";
import { balancesAt, closingFingerprint } from "./financialReview";

export interface ClosingReconciliationLine {
  key: string;
  kind: "account" | "card";
  id: string;
  name: string;
  currency: "DOP" | "USD";
  calculatedMinor: number;
  reportedMinor: number;
  deltaMinor: number;
  reservedMinor: number;
}

export interface ClosingReconciliationPreview {
  closing: CycleClosing;
  lines: ClosingReconciliationLine[];
  adjustments: ClosingReconciliationLine[];
  errors: string[];
  alreadyReconciled: boolean;
}

const metadataAt = (actor: string, nowIso: string, existing?: RecordMetadata): RecordMetadata => ({
  createdAt: existing?.createdAt || nowIso,
  createdBy: existing?.createdBy || actor,
  updatedAt: nowIso,
  updatedBy: actor,
  version: (existing?.version || 0) + 1,
  archivedAt: existing?.archivedAt,
});

const reconciliationTransactionId = (closing: CycleClosing, balance: ClosingBalance): string =>
  `closing-reconciliation-${closing.id}-${balance.kind}-${balance.id}${balance.kind === "card" ? `-${balance.currency}` : ""}`;

export function previewClosingReconciliation(data: FinancialData, closing: CycleClosing): ClosingReconciliationPreview {
  const errors: string[] = [];
  const alreadyReconciled = Boolean(closing.reconciledAt);
  const stored = data.cycleClosings[closing.id];

  if (alreadyReconciled) errors.push("Este cierre ya fue reconciliado y no puede aplicarse una segunda vez.");

  const currentBalances = new Map(balancesAt(data, closing.cutoff).map((balance) => [balance.key, balance]));
  const lines: ClosingReconciliationLine[] = [];

  for (const balance of closing.balances) {
    if (balance.reportedMinor === undefined || balance.unavailable) continue;
    const current = currentBalances.get(balance.key);
    if (!current) {
      errors.push(`No se encontró ${balance.name} en la configuración actual.`);
      continue;
    }
    if (stored && current.calculatedMinor !== balance.calculatedMinor) {
      errors.push(`${balance.name} ya no coincide con el cálculo guardado en el cierre. Revisa el historial antes de reconciliar.`);
      continue;
    }
    if (balance.kind === "account" && balance.reportedMinor < balance.reservedMinor) {
      errors.push(`${balance.name}: el saldo real es menor que el dinero apartado. Revisa primero los ahorros vinculados.`);
      continue;
    }
    if (balance.kind === "card" && balance.reportedMinor < 0) {
      errors.push(`${balance.name}: la deuda reportada no puede ser negativa.`);
      continue;
    }
    lines.push({
      key: balance.key,
      kind: balance.kind,
      id: balance.id,
      name: balance.name,
      currency: balance.currency,
      calculatedMinor: balance.calculatedMinor,
      reportedMinor: balance.reportedMinor,
      deltaMinor: balance.reportedMinor - balance.calculatedMinor,
      reservedMinor: balance.reservedMinor,
    });
  }

  const existingAdjustments = [
    ...Object.values(data.moneyTransactions).filter((transaction) => transaction.closingReconciliationId === closing.id && !transaction.reversedAt),
    ...Object.values(data.cardTransactions).filter((transaction) => transaction.closingReconciliationId === closing.id && !transaction.reversedAt),
  ];
  if (!alreadyReconciled && existingAdjustments.length) {
    errors.push("Ya existen ajustes vinculados a este cierre, pero el cierre no está marcado como reconciliado. Revisa la sincronización antes de continuar.");
  }

  return { closing, lines, adjustments: lines.filter((line) => line.deltaMinor !== 0), errors, alreadyReconciled };
}

export function buildClosingReconciliationUpdates(
  data: FinancialData,
  closing: CycleClosing,
  actor: string,
): Record<string, unknown> {
  const preview = previewClosingReconciliation(data, closing);
  if (preview.errors.length) throw new Error(preview.errors.join("\n"));

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  const transactionIds: string[] = [];

  for (const line of preview.adjustments) {
    const sourceBalance = closing.balances.find((balance) => balance.key === line.key)!;
    const id = reconciliationTransactionId(closing, sourceBalance);
    transactionIds.push(id);
    const notes = `Ajuste automático para llevar el saldo calculado al saldo real confirmado en el cierre ${closing.id}.`;
    if (line.kind === "account") {
      const transaction: MoneyTransaction = {
        id,
        accountId: line.id,
        direction: line.deltaMinor > 0 ? "in" : "out",
        type: "adjustment",
        amountMinor: Math.abs(line.deltaMinor),
        currency: line.currency,
        transactionDate: closing.cutoff,
        description: `Conciliación de cierre · ${closing.financialMonth} Q${closing.quincena}`,
        closingReconciliationId: closing.id,
        notes,
        ...metadataAt(actor, nowIso),
      };
      updates[`moneyTransactions/${id}`] = transaction;
    } else {
      const transaction: CardTransaction = {
        id,
        cardId: line.id,
        currency: line.currency,
        type: "adjustment",
        amountMinor: line.deltaMinor,
        transactionDate: closing.cutoff,
        description: `Conciliación de cierre · ${closing.financialMonth} Q${closing.quincena}`,
        closingReconciliationId: closing.id,
        notes,
        ...metadataAt(actor, nowIso),
      };
      updates[`cardTransactions/${id}`] = transaction;
    }
  }

  const candidate = applyFinancialUpdates(data, updates);
  const incomplete = closing.balances.some((balance) => balance.unavailable || balance.reportedMinor === undefined);
  const unresolvedIssues = Object.values(candidate.balanceIssues)
    .some((issue) => issue.status === "pending" && issue.date <= closing.cutoff);
  const existing = data.cycleClosings[closing.id];
  const closingMetadata = existing ? metadataAt(actor, nowIso, existing) : {
    createdAt: closing.createdAt,
    createdBy: closing.createdBy,
    updatedAt: nowIso,
    updatedBy: actor,
    version: closing.version,
  };
  const reconciledClosing: CycleClosing = {
    ...closing,
    status: incomplete ? "incomplete" : unresolvedIssues ? "differences" : "reconciled",
    fingerprint: closingFingerprint(candidate, closing.cutoff),
    fingerprintVersion: 2,
    reconciledAt: nowIso,
    reconciledBy: actor,
    ...(transactionIds.length ? { reconciliationTransactionIds: transactionIds } : {}),
    ...closingMetadata,
  };
  updates[`cycleClosings/${closing.id}`] = reconciledClosing;
  return updates;
}

export function pendingClosingReconciliations(data: FinancialData): CycleClosing[] {
  return Object.values(data.cycleClosings)
    .filter((closing) => !closing.reconciledAt
      && closing.balances.some((balance) => balance.reportedMinor !== undefined
        && !balance.unavailable
        && balance.reportedMinor !== balance.calculatedMinor))
    .sort((a, b) => b.cutoff.localeCompare(a.cutoff) || b.revision - a.revision);
}
