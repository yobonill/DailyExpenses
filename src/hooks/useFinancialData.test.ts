import { describe, expect, it } from "vitest";
import { migratePendingFinancialOperation, normalizeFinancialData } from "../lib/financialState";
import { toFirebaseCompatibleValue } from "./useFinancialData";

const collectInvalidFirebaseKeys = (value: unknown, path = "root"): string[] => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectInvalidFirebaseKeys(item, `${path}/${index}`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const current = `${path}/${key}`;
    const own = /[.#$\[\]\/]/.test(key) ? [current] : [];
    return [...own, ...collectInvalidFirebaseKeys(child, current)];
  });
};

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
  it("migrates queued v2.2.0 audit maps into Firebase-safe entry arrays", () => {
    const operation = migratePendingFinancialOperation({
      id: "op",
      createdAt: "2026-09-19T12:00:00.000Z",
      updates: {
        "changeAudits/audit": {
          id: "audit",
          description: "Registro de movimiento",
          before: { "payments/payment-1": null },
          after: { "payments/payment-1": { id: "payment-1", amountMinor: 100 } },
          createdAt: "2026-09-19T12:00:00.000Z",
          createdBy: "u",
          updatedAt: "2026-09-19T12:00:00.000Z",
          updatedBy: "u",
          version: 1,
        },
      },
    });
    const audit = operation.updates["changeAudits/audit"] as { before: Array<{ path: string }>; after: Array<{ path: string }> };
    expect(Array.isArray(audit.before)).toBe(true);
    expect(Array.isArray(audit.after)).toBe(true);
    expect(audit.before[0].path).toBe("payments/payment-1");
    expect(audit.after[0].path).toBe("payments/payment-1");
    expect(JSON.stringify(audit)).not.toContain('"payments/payment-1":');
    expect(collectInvalidFirebaseKeys(toFirebaseCompatibleValue(audit))).toEqual([]);
  });

});
