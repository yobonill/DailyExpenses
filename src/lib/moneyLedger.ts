import type { FinancialData, MoneyAccountId, MoneyTransaction } from "../models/finance";

export const BANK_ACCOUNT_ID: MoneyAccountId = "bank";
export const CASH_ACCOUNT_ID: MoneyAccountId = "cash";

export const moneyAccountLabel = (id: MoneyAccountId): string => id === "bank" ? "Banco" : "Efectivo";

export const getMoneyTransactionEffect = (transaction: MoneyTransaction): number =>
  transaction.direction === "in" ? transaction.amountMinor : -transaction.amountMinor;

export const getMoneyAccountBalance = (data: FinancialData, accountId: MoneyAccountId): number => {
  const account = data.moneyAccounts[accountId];
  if (!account) return 0;
  return Object.values(data.moneyTransactions)
    .filter((transaction) => transaction.accountId === accountId && !transaction.reversedAt)
    .reduce((total, transaction) => total + getMoneyTransactionEffect(transaction), account.openingBalanceMinor);
};

export const getTotalMoneyAvailable = (data: FinancialData): number =>
  getMoneyAccountBalance(data, BANK_ACCOUNT_ID) + getMoneyAccountBalance(data, CASH_ACCOUNT_ID);

export const hasInitializedMoneyAccounts = (data: FinancialData): boolean =>
  Boolean(data.moneyAccounts[BANK_ACCOUNT_ID] && data.moneyAccounts[CASH_ACCOUNT_ID]);

export const calculateTransferFeeMinor = (amountMinor: number, ratePercent: number): number =>
  Math.max(0, Math.round(amountMinor * Math.max(0, ratePercent) / 100));

