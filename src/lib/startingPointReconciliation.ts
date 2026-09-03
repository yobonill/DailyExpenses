import { createId } from "./id";
import type {
  FinancialData,
  HistoricalPaymentSource,
  Payment,
  RecordMetadata,
} from "../models/finance";

export interface ReconciledBillInput {
  occurrenceId: string;
  amountMinor: number;
}

export interface ReconciledIncomeInput {
  occurrenceId: string;
  amountMinor: number;
}

export interface StartingPointReconciliationInput {
  trackingStartDate: string;
  historicalSource: HistoricalPaymentSource;
  cardId?: string;
  bills: ReconciledBillInput[];
  incomes: ReconciledIncomeInput[];
}

const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const metadata = (actor: string, nowIso: string, existing?: RecordMetadata): RecordMetadata => ({
  createdAt: existing?.createdAt || nowIso,
  createdBy: existing?.createdBy || actor,
  updatedAt: nowIso,
  updatedBy: actor,
  version: (existing?.version || 0) + 1,
  archivedAt: existing?.archivedAt,
});

export const historicalSourceLabel = (source: HistoricalPaymentSource): string => ({
  unknown: "Origen no especificado",
  creditCardOpeningBalance: "Tarjeta · incluido en la deuda inicial",
  cashOrBankBeforeTracking: "Efectivo o banco · anterior al seguimiento",
})[source];

export const buildStartingPointReconciliationUpdates = (
  data: FinancialData,
  input: StartingPointReconciliationInput,
  actor: string,
  nowIso = new Date().toISOString(),
): Record<string, unknown> => {
  if (!isDateKey(input.trackingStartDate)) throw new Error("Selecciona una fecha válida para iniciar el seguimiento.");
  if (!input.bills.length && !input.incomes.length) throw new Error("Selecciona al menos una factura o un ingreso.");
  if (data.settings.trackingStartDate && data.settings.trackingStartDate !== input.trackingStartDate) {
    throw new Error("La fecha de inicio ya fue establecida y no puede cambiarse durante otra reconciliación.");
  }
  if (input.historicalSource === "creditCardOpeningBalance" && (!input.cardId || !data.creditCards[input.cardId])) {
    throw new Error("No se encontró la tarjeta asociada con la deuda inicial.");
  }

  const billIds = new Set<string>();
  const incomeIds = new Set<string>();
  const updates: Record<string, unknown> = {};

  input.bills.forEach((selected) => {
    if (billIds.has(selected.occurrenceId)) throw new Error("Hay una factura repetida en la reconciliación.");
    billIds.add(selected.occurrenceId);
    const occurrence = data.monthlyOccurrences[selected.occurrenceId];
    if (!occurrence || occurrence.status !== "upcoming") {
      throw new Error("Una de las facturas seleccionadas ya no está pendiente.");
    }
    if (!Number.isSafeInteger(selected.amountMinor) || selected.amountMinor <= 0) {
      throw new Error(`Revisa el monto de ${occurrence.name}.`);
    }

    const paymentId = createId();
    const payment: Payment = {
      id: paymentId,
      sourceType: "monthly",
      sourceId: occurrence.id,
      amountMinor: selected.amountMinor,
      currency: occurrence.currency,
      paidDate: input.trackingStartDate,
      method: input.historicalSource === "creditCardOpeningBalance" ? "creditCard" : "cash",
      cardId: input.historicalSource === "creditCardOpeningBalance" ? input.cardId : undefined,
      historical: true,
      historicalSource: input.historicalSource,
      notes: "Registrado durante la reconciliación inicial; no altera saldos actuales.",
      ...metadata(actor, nowIso),
    };
    updates[`payments/${paymentId}`] = payment;
    updates[`monthlyOccurrences/${occurrence.id}`] = {
      ...occurrence,
      status: "paid",
      actualAmountMinor: selected.amountMinor,
      paymentId,
      reconciledAt: nowIso,
      ...metadata(actor, nowIso, occurrence),
    };
  });

  input.incomes.forEach((selected) => {
    if (incomeIds.has(selected.occurrenceId)) throw new Error("Hay un ingreso repetido en la reconciliación.");
    incomeIds.add(selected.occurrenceId);
    const occurrence = data.incomeOccurrences[selected.occurrenceId];
    if (!occurrence || occurrence.status !== "expected") {
      throw new Error("Uno de los ingresos seleccionados ya no está pendiente.");
    }
    if (!Number.isSafeInteger(selected.amountMinor) || selected.amountMinor <= 0) {
      throw new Error(`Revisa el monto de ${occurrence.name}.`);
    }
    updates[`incomeOccurrences/${occurrence.id}`] = {
      ...occurrence,
      status: "received",
      actualAmountMinor: selected.amountMinor,
      receivedDate: input.trackingStartDate,
      reconciledAt: nowIso,
      ...metadata(actor, nowIso, occurrence),
    };
  });

  updates.settings = {
    ...data.settings,
    trackingStartDate: data.settings.trackingStartDate || input.trackingStartDate,
    reconciliationCompletedAt: nowIso,
    updatedAt: nowIso,
    updatedBy: actor,
  };
  return updates;
};
