import { describe, expect, it } from "vitest";
import { createEmptyFinancialData } from "./financialState";
import { isFinanciallyConsistent, reconcileVersionedUpdates } from "./financialIntegrity";

const metadata = {
  createdAt: "2026-01-01T00:00:00.000Z", createdBy: "u1",
  updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "u1", version: 1,
};

describe("shared financial integrity", () => {
  it("rejects stale edits and skips duplicate idempotent generation", () => {
    const data = createEmptyFinancialData();
    data.monthlyTemplates.internet = {
      id: "internet", name: "Internet", estimatedAmountMinor: 1000, currency: "DOP",
      dueRule: { kind: "day", day: 18 }, variableAmount: false, canPayWithCard: true,
      active: true, ...metadata, version: 2,
    };
    expect(reconcileVersionedUpdates(data, {
      "monthlyTemplates/internet": { ...data.monthlyTemplates.internet, name: "stale", version: 2 },
    }).conflict).toBe(true);
    expect(reconcileVersionedUpdates(data, {
      "monthlyTemplates/internet": { ...data.monthlyTemplates.internet, version: 1 },
    })).toEqual({ updates: {}, conflict: false });
  });

  it("rejects duplicate active payments and savings oversubscription", () => {
    const data = createEmptyFinancialData();
    data.payments.one = { id: "one", sourceType: "monthly", sourceId: "bill", amountMinor: 1000, currency: "DOP", paidDate: "2026-01-18", method: "cash", ...metadata };
    data.payments.two = { id: "two", sourceType: "monthly", sourceId: "bill", amountMinor: 1000, currency: "DOP", paidDate: "2026-01-18", method: "cash", ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(false);

    delete data.payments.two;
    data.savingsFunds.fund = { id: "fund", name: "Fondo", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "fund", type: "deposit", amountMinor: 1000, currency: "DOP", transactionDate: "2026-01-01", ...metadata };
    data.nonMonthlyOccurrences.future = { id: "future", planId: "plan", name: "Seguro", expectedAmountMinor: 2000, currency: "DOP", dueDate: "2026-12-01", status: "upcoming", canPayWithCard: true, ...metadata };
    data.savingsAllocations.allocation = { id: "allocation", fundId: "fund", obligationType: "nonMonthly", obligationId: "future", amountMinor: 1500, currency: "DOP", active: true, ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("accepts only USD card payments with a positive DOP settlement", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 1000,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 1000,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardTransactions.payment = {
      id: "payment", cardId: "card", currency: "USD", type: "payment", amountMinor: 1000,
      settlementAmountDopMinor: 62500, transactionDate: "2026-08-20", description: "Pago USD",
      affectsCurrentBalance: false, ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);

    data.cardTransactions.payment = {
      ...data.cardTransactions.payment,
      currency: "DOP",
    };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("rejects concurrent card payments that would overpay the balance", () => {
    const data = createEmptyFinancialData();
    data.creditCards.card = {
      id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true,
      openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 1000,
      openingStatementDopMinor: 0, openingStatementUsdMinor: 1000,
      openingDate: "2026-08-01", ...metadata,
    };
    data.cardTransactions.first = {
      id: "first", cardId: "card", currency: "USD", type: "payment", amountMinor: 700,
      settlementAmountDopMinor: 43750, transactionDate: "2026-08-20", description: "Primer pago", ...metadata,
    };
    data.cardTransactions.second = {
      id: "second", cardId: "card", currency: "USD", type: "payment", amountMinor: 700,
      settlementAmountDopMinor: 43750, transactionDate: "2026-08-20", description: "Segundo pago", ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("validates purchase-goal savings and linked card purchases", () => {
    const data = createEmptyFinancialData();
    data.purchaseGoals.tv = {
      id: "tv", name: "Televisor", estimatedAmountMinor: 5000000, currency: "DOP",
      priority: "high", status: "purchased", purchaseMethod: "creditCard",
      linkedCardTransactionId: "charge", ...metadata,
    };
    data.savingsFunds.home = { id: "home", name: "Hogar", currency: "DOP", active: true, ...metadata };
    data.savingsTransactions.deposit = { id: "deposit", fundId: "home", type: "deposit", amountMinor: 1000000, currency: "DOP", transactionDate: "2026-08-01", ...metadata };
    data.savingsAllocations.tv = { id: "allocation", fundId: "home", obligationType: "purchaseGoal", obligationId: "tv", amountMinor: 1000000, currency: "DOP", active: true, ...metadata };
    data.creditCards.card = { id: "card", name: "Visa", cutDay: 20, dueDay: 15, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-08-01", ...metadata };
    data.cardTransactions.charge = { id: "charge", cardId: "card", currency: "DOP", type: "charge", amountMinor: 5000000, transactionDate: "2026-08-20", description: "Televisor", linkedPurchaseGoalId: "tv", ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(true);

    delete data.purchaseGoals.tv;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("rejects invalid card payment plans", () => {
    const data = createEmptyFinancialData();
    data.cardPaymentPlans.plan = {
      id: "plan", financialMonth: "2026-08", quincena: 1,
      plannedDopMinor: 10000, plannedUsdMinor: 0, ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);
    data.cardPaymentPlans.plan.plannedDopMinor = -1;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("accepts only positive configured minimum payments", () => {
    const data = createEmptyFinancialData();
    data.cardStatements.statement = {
      id: "statement", cardId: "card", currency: "DOP", cycleStartDate: "2026-07-21",
      cutDate: "2026-08-20", dueDate: "2026-09-15", statementAmountMinor: 100000,
      minimumPaymentMinor: 10000, status: "open", ...metadata,
    };
    expect(isFinanciallyConsistent(data)).toBe(true);
    data.cardStatements.statement.minimumPaymentMinor = 0;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("keeps exact money balances nonnegative and validates loan principal history", () => {
    const data = createEmptyFinancialData();
    data.moneyAccounts.bank = { id: "bank", kind: "bank", name: "Banco", currency: "DOP", openingBalanceMinor: 50_000, openingDate: "2026-09-03", active: true, ...metadata };
    data.moneyAccounts.cash = { id: "cash", kind: "cash", name: "Efectivo", currency: "DOP", openingBalanceMinor: 10_000, openingDate: "2026-09-03", active: true, ...metadata };
    data.loans.loan = { id: "loan", name: "Préstamo", currency: "DOP", openingBalanceMinor: 100_000, openingDate: "2026-09-03", annualInterestRate: 18, active: true, ...metadata };
    data.payments.payment = { id: "payment", sourceType: "monthly", sourceId: "bill", amountMinor: 12_000, currency: "DOP", paidDate: "2026-10-03", method: "bankTransfer", moneyAccountId: "bank", moneyTransactionId: "money", loanId: "loan", loanTransactionId: "loan-payment", ...metadata };
    data.moneyTransactions.money = { id: "money", accountId: "bank", direction: "out", type: "loanPayment", amountMinor: 12_000, currency: "DOP", transactionDate: "2026-10-03", description: "Cuota", linkedPaymentId: "payment", linkedLoanTransactionId: "loan-payment", ...metadata };
    data.loanTransactions["loan-payment"] = { id: "loan-payment", loanId: "loan", type: "payment", transactionDate: "2026-10-03", totalPaymentMinor: 12_000, principalMinor: 9_000, interestMinor: 2_500, chargesMinor: 500, balanceBeforeMinor: 100_000, balanceAfterMinor: 91_000, linkedPaymentId: "payment", ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(true);
    data.loanTransactions["loan-payment"].principalMinor = 10_000;
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("validates bank-account ownership and linked financial products", () => {
    const data = createEmptyFinancialData();
    data.banks.bank = { id: "bank", name: "Banco de prueba", active: true, ...metadata };
    data.moneyAccounts.account = { id: "account", kind: "bank", bankId: "bank", accountType: "savings", name: "Ahorros", currency: "DOP", openingBalanceMinor: 10_000, openingDate: "2026-09-03", active: true, ...metadata };
    data.creditCards.card = { id: "card", name: "Visa", bankId: "bank", cutDay: 15, dueDay: 10, active: true, openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, openingStatementDopMinor: 0, openingStatementUsdMinor: 0, openingDate: "2026-09-03", ...metadata };
    data.loans.loan = { id: "loan", name: "Personal", bankId: "bank", currency: "DOP", openingBalanceMinor: 100_000, openingDate: "2026-09-03", annualInterestRate: 18, active: true, ...metadata };
    data.savingsFunds.fund = { id: "fund", name: "Emergencia", currency: "DOP", moneyAccountId: "account", active: true, ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(true);

    data.moneyAccounts.account.bankId = "missing";
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("allows USD savings in a USD bank account and rejects currency mismatches", () => {
    const data = createEmptyFinancialData();
    data.banks.bank = { id: "bank", name: "Banco de prueba", active: true, ...metadata };
    data.moneyAccounts.usd = { id: "usd", kind: "bank", bankId: "bank", accountType: "savings", name: "Cuenta USD", currency: "USD", openingBalanceMinor: 51_000, openingDate: "2026-09-03", active: true, ...metadata };
    data.moneyTransactions.deposit = { id: "deposit", accountId: "usd", direction: "in", type: "income", amountMinor: 10_000, currency: "USD", transactionDate: "2026-09-03", description: "Ingreso USD", ...metadata };
    data.savingsFunds.fund = { id: "fund", name: "Juegos", currency: "USD", moneyAccountId: "usd", active: true, ...metadata };
    data.incomeOccurrences.income = { id: "income", name: "Freelance", incomeType: "oneTime", expectedAmountMinor: 10_000, actualAmountMinor: 10_000, currency: "USD", expectedDate: "2026-09-03", receivedDate: "2026-09-03", financialMonth: "2026-08", quincena: 2, status: "received", oneTime: true, moneyAccountId: "usd", moneyTransactionId: "deposit", exportExpectedWhenPending: true, ...metadata };

    expect(isFinanciallyConsistent(data)).toBe(true);
    data.savingsFunds.fund.currency = "DOP";
    expect(isFinanciallyConsistent(data)).toBe(false);
  });

  it("keeps the system cash account in DOP", () => {
    const data = createEmptyFinancialData();
    data.moneyAccounts.cash = { id: "cash", kind: "cash", name: "Efectivo", currency: "USD", openingBalanceMinor: 100, openingDate: "2026-09-03", active: true, ...metadata };
    expect(isFinanciallyConsistent(data)).toBe(false);
  });
});
