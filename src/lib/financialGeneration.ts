import type {
  CardStatement,
  Currency,
  FinancialData,
  IncomeOccurrence,
  MonthlyExpenseOccurrence,
  NonMonthlyOccurrence,
  RecordMetadata,
} from "../models/finance";
import { getMonthKey, getQuincena } from "./date";
import {
  addDaysToDateKey,
  dateFromFinancialMonthRule,
  financialMonthKeys,
  financialMonthDifference,
  getCurrentFinancialPeriod,
  getFirstDueDateAfterCut,
  getLatestCutDate,
  getPreviousCutDate,
} from "./financeDates";
import { getCardTransactionEffect } from "./financialCalculations";

const metadata = (actor: string, nowIso: string): RecordMetadata => ({
  createdAt: nowIso,
  createdBy: actor,
  updatedAt: nowIso,
  updatedBy: actor,
  version: 1,
});

const statementAmountAtCut = (
  data: FinancialData,
  cardId: string,
  currency: Currency,
  cutDate: string,
): number => {
  const card = data.creditCards[cardId];
  const opening = currency === "DOP" ? card.openingStatementDopMinor : card.openingStatementUsdMinor;
  return Math.max(0, Object.values(data.cardTransactions)
    .filter((transaction) => transaction.cardId === cardId
      && transaction.currency === currency
      && !transaction.reversedAt
      && transaction.transactionDate <= cutDate)
    .reduce((total, transaction) => total + getCardTransactionEffect(transaction.type, transaction.amountMinor), opening));
};

export const buildGenerationUpdates = (
  data: FinancialData,
  actor: string,
  today = new Date(),
): Record<string, unknown> => {
  const nowIso = today.toISOString();
  const current = getCurrentFinancialPeriod(today);
  const updates: Record<string, unknown> = {};

  Object.values(data.monthlyTemplates).filter((template) => template.active && !template.archivedAt).forEach((template) => {
    const createdMonth = getMonthKey(template.createdAt.slice(0, 10));
    const startMonth = createdMonth;
    const monthKeys = financialMonthKeys(startMonth, financialMonthDifference(startMonth, current.financialMonth) + 13);
    monthKeys.forEach((financialMonth) => {
      const id = `${template.id}_${financialMonth}`;
      if (data.monthlyOccurrences[id]) return;
      const dueDate = dateFromFinancialMonthRule(financialMonth, template.dueRule);
      const occurrence: MonthlyExpenseOccurrence = {
        id,
        templateId: template.id,
        name: template.name,
        category: template.category,
        expectedAmountMinor: template.estimatedAmountMinor,
        currency: template.currency,
        dueDate,
        financialMonth,
        quincena: template.plannedQuincena ?? getQuincena(dueDate),
        status: "upcoming",
        canPayWithCard: template.canPayWithCard,
        oneTime: false,
        notes: template.notes,
        excelRowLabel: template.excelRowLabel,
        ...metadata(actor, nowIso),
      };
      updates[`monthlyOccurrences/${id}`] = occurrence;
    });
  });

  Object.values(data.incomeTemplates).filter((template) => template.active && !template.archivedAt).forEach((template) => {
    const createdMonth = getMonthKey(template.createdAt.slice(0, 10));
    const startMonth = createdMonth;
    const monthKeys = financialMonthKeys(startMonth, financialMonthDifference(startMonth, current.financialMonth) + 13);
    monthKeys.forEach((financialMonth) => {
      const expectedDate = dateFromFinancialMonthRule(financialMonth, template.dueRule);
      const id = `${template.id}_${expectedDate}`;
      if (data.incomeOccurrences[id]) return;
      const occurrence: IncomeOccurrence = {
        id,
        templateId: template.id,
        name: template.name,
        incomeType: template.incomeType,
        expectedAmountMinor: template.expectedAmountMinor,
        currency: template.currency,
        expectedDate,
        financialMonth,
        quincena: getQuincena(expectedDate),
        status: "expected",
        oneTime: false,
        notes: template.notes,
        excelRowLabel: template.excelRowLabel,
        exportExpectedWhenPending: template.exportExpectedWhenPending,
        ...metadata(actor, nowIso),
      };
      updates[`incomeOccurrences/${id}`] = occurrence;
    });
  });

  Object.values(data.nonMonthlyExpenses).filter((plan) => plan.active && !plan.archivedAt).forEach((plan) => {
    const id = `${plan.id}_${plan.nextDueDate}`;
    if (data.nonMonthlyOccurrences[id]) return;
    const occurrence: NonMonthlyOccurrence = {
      id,
      planId: plan.id,
      name: plan.name,
      category: plan.category,
      expectedAmountMinor: plan.estimatedAmountMinor,
      currency: plan.currency,
      dueDate: plan.nextDueDate,
      status: "upcoming",
      canPayWithCard: plan.canPayWithCard,
      notes: plan.notes,
      ...metadata(actor, nowIso),
    };
    updates[`nonMonthlyOccurrences/${id}`] = occurrence;
  });

  const todayKey = current.dateKey;
  Object.values(data.creditCards).filter((card) => !card.archivedAt).forEach((card) => {
    const latestCut = getLatestCutDate(todayKey, card.cutDay);
    let cursor = getLatestCutDate(card.openingDate, card.cutDay);
    while (cursor <= latestCut) {
      const cutDate = cursor;
      (["DOP", "USD"] as Currency[]).forEach((currency) => {
        const id = `${card.id}_${currency}_${cutDate}`;
        if (data.cardStatements[id]) return;
        const previousCut = getPreviousCutDate(cutDate, card.cutDay);
        const statement: CardStatement = {
          id,
          cardId: card.id,
          currency,
          cycleStartDate: addDaysToDateKey(previousCut, 1),
          cutDate,
          dueDate: getFirstDueDateAfterCut(cutDate, card.dueDay),
          statementAmountMinor: statementAmountAtCut(data, card.id, currency, cutDate),
          status: "open",
          ...metadata(actor, nowIso),
        };
        updates[`cardStatements/${id}`] = statement;
      });
      const [year, month] = cursor.split("-").map(Number);
      const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
      cursor = `${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}-${String(Math.min(card.cutDay, new Date(nextMonth.year, nextMonth.month, 0).getDate())).padStart(2, "0")}`;
    }
  });

  return updates;
};

export const buildPausedMonthlyOccurrenceUpdates = (
  data: FinancialData,
  templateId: string,
  currentFinancialMonth: string,
): Record<string, null> => Object.fromEntries(
  Object.values(data.monthlyOccurrences)
    .filter((occurrence) => occurrence.templateId === templateId
      && occurrence.status === "upcoming"
      && occurrence.financialMonth > currentFinancialMonth)
    .map((occurrence) => [`monthlyOccurrences/${occurrence.id}`, null]),
);
