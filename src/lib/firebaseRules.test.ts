import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toFirebaseCompatibleValue } from "../hooks/useFinancialData";

// Evaluate the actual payment validation expression, including the fee condition.
// This is a focused rule contract check, not a Firebase emulator replacement.
class RuleSnapshot {
  constructor(private value: unknown) {}
  val(): unknown { return this.value ?? null; }
  exists(): boolean { return this.value !== undefined && this.value !== null; }
  child(key: string): RuleSnapshot { return new RuleSnapshot((this.value as Record<string, unknown> | undefined)?.[key]); }
  hasChild(key: string): boolean { return this.child(key).exists(); }
  hasChildren(keys: string[]): boolean { return keys.every(key => this.hasChild(key)); }
  isNumber(): boolean { return typeof this.value === "number" && Number.isFinite(this.value); }
  isString(): boolean { return typeof this.value === "string"; }
}
const rules = JSON.parse(readFileSync(new URL("../../firebase-database-rules.json", import.meta.url), "utf8"));
const expression: string = rules.rules.dailyExpensesBudget.v1.payments.$id[".validate"];
const validate = (payment: Record<string, unknown>, rule = expression): boolean =>
  new Function("newData", "$id", `return (${rule});`)(new RuleSnapshot(toFirebaseCompatibleValue(payment)), payment.id);
const payment = {
  id: "payment", sourceType: "monthly", sourceId: "obligation", amountMinor: 378300,
  currency: "DOP", paidDate: "2026-10-01", method: "bankTransfer", moneyAccountId: "account",
  moneyTransactionId: "principal", createdAt: "2026-10-01T11:07:39.827Z", createdBy: "user",
  updatedAt: "2026-10-18T10:47:43.397Z", updatedBy: "user", version: 2,
};

describe("payment commission rule compatibility", () => {
  it("accepts the queued zero-fee deletion rejected by the previous rules", () => {
    const queued = { ...payment, transferFeeMinor: 0 };
    expect(validate(queued, expression.replace("val() >= 0", "val() > 0"))).toBe(false);
    expect(validate(queued)).toBe(true);
  });
  it("accepts positive and omitted commission amounts", () => {
    expect(validate({ ...payment, transferFeeMinor: 757 })).toBe(true);
    expect(validate({ ...payment, transferFeeMinor: undefined, feeMoneyTransactionId: undefined })).toBe(true);
  });
  it("still rejects negative fees, invalid fee types and incompatible payment methods", () => {
    for (const fee of [-1, "0", "757"]) expect(validate({ ...payment, transferFeeMinor: fee })).toBe(false);
    expect(validate({ ...payment, transferFeeMinor: 757, method: "cash" })).toBe(false);
    expect(validate({ ...payment, amountMinor: 0, transferFeeMinor: 0 })).toBe(false);
  });
});
