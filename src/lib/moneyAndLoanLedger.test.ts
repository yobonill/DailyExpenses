import { describe, expect, it } from "vitest";
import { createEmptyFinancialData } from "./financialState";
import { calculateTransferFeeMinor, getActiveBankAccounts, getMoneyAccountBalance, getTotalBankBalance, getTotalMoneyAvailable, isSelectableMoneyAccount, moneyAccountLabel } from "./moneyLedger";
import { estimateLoanInterestMinor, getLoanBalance } from "./loanLedger";

const meta = { createdAt: "2026-09-01T00:00:00.000Z", createdBy: "u", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "u", version: 1 };

describe("money and loan ledgers", () => {
  it("tracks exact bank and cash balances including fees and internal transfers", () => {
    const data = createEmptyFinancialData();
    data.moneyAccounts.bank = { id: "bank", kind: "bank", name: "Banco", currency: "DOP", openingBalanceMinor: 100_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyAccounts.cash = { id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 5_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyTransactions.payment = { id: "payment", accountId: "bank", direction: "out", type: "payment", amountMinor: 20_000, currency: "DOP", transactionDate: "2026-09-02", description: "Factura", ...meta };
    data.moneyTransactions.fee = { id: "fee", accountId: "bank", direction: "out", type: "fee", amountMinor: 30, currency: "DOP", transactionDate: "2026-09-02", description: "Comisión", ...meta };
    data.moneyTransactions.withdrawal = { id: "withdrawal", accountId: "bank", direction: "out", type: "transfer", amountMinor: 10_000, currency: "DOP", transactionDate: "2026-09-02", description: "Retiro", transferId: "t", ...meta };
    data.moneyTransactions.cashIn = { id: "cashIn", accountId: "cash", direction: "in", type: "transfer", amountMinor: 10_000, currency: "DOP", transactionDate: "2026-09-02", description: "Retiro", transferId: "t", ...meta };
    expect(getMoneyAccountBalance(data, "bank")).toBe(69_970);
    expect(getMoneyAccountBalance(data, "cash")).toBe(15_000);
    expect(getTotalMoneyAvailable(data)).toBe(84_970);
    expect(calculateTransferFeeMinor(200_000, 0.15)).toBe(300);
  });

  it("keeps balances separate across multiple banks and accounts", () => {
    const data = createEmptyFinancialData();
    data.banks.scotia = { id: "scotia", name: "Scotiabank", active: true, ...meta };
    data.banks.popular = { id: "popular", name: "Banco Popular", active: true, ...meta };
    data.moneyAccounts.payroll = { id: "payroll", kind: "bank", bankId: "popular", accountType: "payroll", name: "Nómina", currency: "DOP", openingBalanceMinor: 80_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyAccounts.cardPayments = { id: "cardPayments", kind: "bank", bankId: "scotia", accountType: "savings", name: "Pago de tarjeta", currency: "DOP", openingBalanceMinor: 35_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyAccounts.cash = { id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 5_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyTransactions.cardPayment = { id: "cardPayment", accountId: "cardPayments", direction: "out", type: "cardPayment", amountMinor: 10_000, currency: "DOP", transactionDate: "2026-09-02", description: "Tarjeta", ...meta };

    expect(getMoneyAccountBalance(data, "payroll")).toBe(80_000);
    expect(getMoneyAccountBalance(data, "cardPayments")).toBe(25_000);
    expect(getTotalBankBalance(data)).toBe(105_000);
    expect(getTotalMoneyAvailable(data)).toBe(110_000);
    expect(getActiveBankAccounts(data).map((account) => account.id)).toEqual(["payroll", "cardPayments"]);
    expect(moneyAccountLabel("cardPayments", data)).toBe("Scotiabank · Pago de tarjeta");
  });

  it("keeps DOP and USD bank balances separate", () => {
    const data = createEmptyFinancialData();
    data.banks.bank = { id: "bank", name: "Banco de prueba", active: true, ...meta };
    data.moneyAccounts.dop = { id: "dop", kind: "bank", bankId: "bank", accountType: "savings", name: "Pesos", currency: "DOP", openingBalanceMinor: 50_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyAccounts.usd = { id: "usd", kind: "bank", bankId: "bank", accountType: "savings", name: "Dólares", currency: "USD", openingBalanceMinor: 51_000, openingDate: "2026-09-01", active: true, ...meta };
    data.moneyTransactions.usdDeposit = { id: "usdDeposit", accountId: "usd", direction: "in", type: "income", amountMinor: 9_000, currency: "USD", transactionDate: "2026-09-02", description: "Ingreso USD", ...meta };

    expect(getTotalBankBalance(data, "DOP")).toBe(50_000);
    expect(getTotalBankBalance(data, "USD")).toBe(60_000);
    expect(getTotalMoneyAvailable(data, "DOP")).toBe(50_000);
    expect(getTotalMoneyAvailable(data, "USD")).toBe(60_000);
    expect(getActiveBankAccounts(data, "DOP").map((account) => account.id)).toEqual(["dop"]);
    expect(getActiveBankAccounts(data, "USD").map((account) => account.id)).toEqual(["usd"]);
    expect(isSelectableMoneyAccount(data, "usd", "bankTransfer", "USD")).toBe(true);
    expect(isSelectableMoneyAccount(data, "usd", "bankTransfer", "DOP")).toBe(false);
  });

  it("reduces loans only by principal and supports exact bank adjustments", () => {
    const data = createEmptyFinancialData();
    data.loans.loan = { id: "loan", name: "Préstamo", currency: "DOP", openingBalanceMinor: 1_000_000, openingDate: "2026-09-01", annualInterestRate: 18, active: true, ...meta };
    data.loanTransactions.payment = { id: "payment", loanId: "loan", type: "payment", transactionDate: "2026-10-01", totalPaymentMinor: 100_000, principalMinor: 85_000, interestMinor: 15_000, chargesMinor: 0, balanceBeforeMinor: 1_000_000, balanceAfterMinor: 915_000, ...meta };
    data.loanTransactions.adjustment = { id: "adjustment", loanId: "loan", type: "adjustment", transactionDate: "2026-10-02", adjustmentMinor: -5_000, balanceBeforeMinor: 915_000, balanceAfterMinor: 910_000, ...meta };
    expect(getLoanBalance(data, "loan")).toBe(910_000);
    expect(estimateLoanInterestMinor(createEmptyFinancialData(), "missing", "2026-10-01")).toBe(0);
  });
});
