import { describe, expect, it } from "vitest";
import { normalizeFinancialData } from "../lib/financialState";
import { toFirebaseCompatibleValue } from "./useFinancialData";

describe("financial Firebase serialization", () => {
  it("removes optional undefined fields before a transaction is submitted", () => {
    const normalized = normalizeFinancialData(null);

    expect(Object.prototype.hasOwnProperty.call(normalized, "lastBackupAt")).toBe(true);
    expect(normalized.lastBackupAt).toBeUndefined();

    const compatible = toFirebaseCompatibleValue(normalized);
    expect(Object.prototype.hasOwnProperty.call(compatible, "lastBackupAt")).toBe(false);
    expect(JSON.stringify(compatible)).not.toContain("undefined");
  });

  it("adds an empty purchase-goals collection to existing saved data", () => {
    const normalized = normalizeFinancialData({ schemaVersion: 1 });
    expect(normalized.purchaseGoals).toEqual({});
    expect(normalized.cardPaymentPlans).toEqual({});
    expect(normalized.banks).toEqual({});
  });

  it("preserves the generalized bank balance from 1.6.0 for manual distribution", () => {
    const legacyBank = {
      id: "bank", kind: "bank", name: "Banco", currency: "DOP",
      openingBalanceMinor: 123_456, openingDate: "2026-09-01", active: true,
      createdAt: "2026-09-01T00:00:00.000Z", createdBy: "u",
      updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "u", version: 1,
    };
    const normalized = normalizeFinancialData({ schemaVersion: 1, moneyAccounts: { bank: legacyBank } });
    expect(normalized.moneyAccounts.bank).toEqual(legacyBank);
    expect(normalized.banks).toEqual({});
  });
});
