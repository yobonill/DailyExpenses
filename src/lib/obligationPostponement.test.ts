import { describe, expect, it } from "vitest";
import type { MonthlyExpenseOccurrence, NonMonthlyOccurrence, RecordMetadata } from "../models/finance";
import {
  buildPostponedMonthlyOccurrence,
  buildPostponedNonMonthlyOccurrence,
  wasOriginallyInSelectedPeriod,
} from "./obligationPostponement";

const originalMetadata: RecordMetadata = {
  createdAt: "2026-08-01T12:00:00.000Z",
  createdBy: "user-a",
  updatedAt: "2026-08-01T12:00:00.000Z",
  updatedBy: "user-a",
  version: 1,
};

const updatedMetadata: RecordMetadata = {
  ...originalMetadata,
  updatedAt: "2026-08-18T12:00:00.000Z",
  version: 2,
};

const monthly: MonthlyExpenseOccurrence = {
  id: "internet_2026-08",
  templateId: "internet",
  name: "Internet",
  expectedAmountMinor: 150000,
  currency: "DOP",
  dueDate: "2026-08-20",
  financialMonth: "2026-08",
  quincena: 1,
  status: "upcoming",
  canPayWithCard: true,
  oneTime: false,
  ...originalMetadata,
};

describe("obligation postponement", () => {
  it("moves one monthly occurrence to the selected financial period without changing its identity", () => {
    const postponed = buildPostponedMonthlyOccurrence(monthly, "2026-09-20", updatedMetadata);

    expect(postponed).toMatchObject({
      id: "internet_2026-08",
      templateId: "internet",
      dueDate: "2026-09-20",
      financialMonth: "2026-09",
      quincena: 1,
      originalDueDate: "2026-08-20",
      originalFinancialMonth: "2026-08",
      originalQuincena: 1,
      postponedAt: updatedMetadata.updatedAt,
      version: 2,
    });
  });

  it("keeps the first schedule as audit history when postponed more than once", () => {
    const first = buildPostponedMonthlyOccurrence(monthly, "2026-09-20", updatedMetadata);
    const second = buildPostponedMonthlyOccurrence(first, "2026-10-05", {
      ...updatedMetadata,
      updatedAt: "2026-09-01T12:00:00.000Z",
      version: 3,
    });

    expect(second).toMatchObject({
      dueDate: "2026-10-05",
      financialMonth: "2026-09",
      quincena: 2,
      originalDueDate: "2026-08-20",
      originalFinancialMonth: "2026-08",
      originalQuincena: 1,
    });
    expect(wasOriginallyInSelectedPeriod(second, new Set(["2026-08"]), 1)).toBe(true);
    expect(wasOriginallyInSelectedPeriod(second, new Set(["2026-09"]), 1)).toBe(false);
  });

  it("moves a non-monthly occurrence without changing its plan schedule", () => {
    const irregular: NonMonthlyOccurrence = {
      id: "insurance_2026-12-15",
      planId: "insurance",
      name: "Seguro",
      expectedAmountMinor: 3200000,
      currency: "DOP",
      dueDate: "2026-12-15",
      status: "upcoming",
      canPayWithCard: true,
      ...originalMetadata,
    };

    const postponed = buildPostponedNonMonthlyOccurrence(irregular, "2027-01-10", updatedMetadata);
    expect(postponed).toMatchObject({
      id: irregular.id,
      planId: irregular.planId,
      dueDate: "2027-01-10",
      originalDueDate: "2026-12-15",
    });
  });

  it("rejects an equal or earlier date", () => {
    expect(() => buildPostponedMonthlyOccurrence(monthly, "2026-08-20", updatedMetadata))
      .toThrow("posterior");
    expect(() => buildPostponedMonthlyOccurrence(monthly, "2026-08-19", updatedMetadata))
      .toThrow("posterior");
  });
});
