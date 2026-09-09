import { describe, expect, it } from "vitest";
import { buildAccountCenterGroups } from "./accountCenter";
import { createEmptyFinancialData } from "./financialState";

const metadata = {
  createdAt: "2026-09-09T00:00:00.000Z",
  createdBy: "test",
  updatedAt: "2026-09-09T00:00:00.000Z",
  updatedBy: "test",
  version: 1,
};

describe("buildAccountCenterGroups", () => {
  it("groups accounts, savings, card and loans without changing their records", () => {
    const data = createEmptyFinancialData();
    data.banks.scotia = { id: "scotia", name: "Scotiabank", active: true, ...metadata };
    data.moneyAccounts.payments = { id: "payments", kind: "bank", bankId: "scotia", accountType: "savings", name: "Pagos", currency: "DOP", openingBalanceMinor: 10_000, openingDate: "2026-09-09", active: true, ...metadata };
    data.moneyAccounts.cash = { id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 2_000, openingDate: "2026-09-09", active: true, ...metadata };
    data.savingsFunds.emergency = { id: "emergency", name: "Emergencia", currency: "DOP", moneyAccountId: "payments", active: true, ...metadata };
    data.savingsFunds.wallet = { id: "wallet", name: "Sobre", currency: "DOP", moneyAccountId: "cash", active: true, ...metadata };
    data.savingsFunds.unassigned = { id: "unassigned", name: "Vacaciones", currency: "DOP", active: true, ...metadata };
    data.creditCards.bravo = { id: "bravo", name: "Visa Bravo", bankId: "scotia", cutDay: 15, dueDay: 10, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-09-09", ...metadata };
    data.loans.personal = { id: "personal", name: "Personal", bankId: "scotia", currency: "DOP", openingBalanceMinor: 0, openingDate: "2026-09-09", annualInterestRate: 0, active: true, ...metadata };

    const result = buildAccountCenterGroups(data);

    expect(result.banks[0].accounts.map((item) => item.id)).toEqual(["payments"]);
    expect(result.banks[0].savingsFunds.map((item) => item.id)).toEqual(["emergency"]);
    expect(result.banks[0].cards.map((item) => item.id)).toEqual(["bravo"]);
    expect(result.banks[0].loans.map((item) => item.id)).toEqual(["personal"]);
    expect(result.cashSavingsFunds.map((item) => item.id)).toEqual(["wallet"]);
    expect(result.unassignedSavingsFunds.map((item) => item.id)).toEqual(["unassigned"]);
  });

  it("keeps products linked to a missing bank visible as pending organization", () => {
    const data = createEmptyFinancialData();
    data.creditCards.bravo = { id: "bravo", name: "Visa Bravo", bankId: "missing", cutDay: 15, dueDay: 10, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-09-09", ...metadata };
    data.loans.personal = { id: "personal", name: "Personal", bankId: "missing", currency: "DOP", openingBalanceMinor: 0, openingDate: "2026-09-09", annualInterestRate: 0, active: true, ...metadata };

    const result = buildAccountCenterGroups(data);

    expect(result.unassignedCards.map((item) => item.id)).toEqual(["bravo"]);
    expect(result.unassignedLoans.map((item) => item.id)).toEqual(["personal"]);
  });
});
