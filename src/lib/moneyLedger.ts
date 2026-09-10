import type { BankAccountType, Currency, FinancialData, MoneyAccount, MoneyAccountId, MoneyTransaction } from "../models/finance";

/** Stable IDs retained for upgrade compatibility. */
export const LEGACY_BANK_ACCOUNT_ID: MoneyAccountId = "bank";
export const BANK_ACCOUNT_ID: MoneyAccountId = LEGACY_BANK_ACCOUNT_ID;
export const CASH_ACCOUNT_ID: MoneyAccountId = "cash";

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Cuenta corriente",
  savings: "Cuenta de ahorros",
  payroll: "Cuenta de nómina",
  digital: "Cuenta digital",
  other: "Otra cuenta",
};

export const getMoneyTransactionEffect = (transaction: MoneyTransaction): number =>
  transaction.direction === "in" ? transaction.amountMinor : -transaction.amountMinor;

export const getMoneyAccountBalance = (data: FinancialData, accountId: MoneyAccountId): number => {
  const account = data.moneyAccounts[accountId];
  if (!account) return 0;
  return Object.values(data.moneyTransactions)
    .filter((transaction) => transaction.accountId === accountId && !transaction.reversedAt)
    .reduce((total, transaction) => total + getMoneyTransactionEffect(transaction), account.openingBalanceMinor);
};

export const getBankAccounts = (data: FinancialData, includeLegacy = false): MoneyAccount[] =>
  Object.values(data.moneyAccounts)
    .filter((account) => account.kind === "bank"
      && !account.archivedAt
      && (includeLegacy || account.id !== LEGACY_BANK_ACCOUNT_ID))
    .sort((a, b) => {
      const bankA = a.bankId ? data.banks[a.bankId]?.name || "" : "";
      const bankB = b.bankId ? data.banks[b.bankId]?.name || "" : "";
      return bankA.localeCompare(bankB, "es") || a.name.localeCompare(b.name, "es");
    });

export const getActiveBankAccounts = (data: FinancialData, currency: Currency = "DOP"): MoneyAccount[] =>
  getBankAccounts(data).filter((account) => account.currency === currency
    && account.active
    && Boolean(account.bankId && data.banks[account.bankId]?.active));

export const getCashAccount = (data: FinancialData): MoneyAccount | undefined =>
  data.moneyAccounts[CASH_ACCOUNT_ID];

export const getTotalBankBalance = (data: FinancialData, currency: Currency = "DOP"): number =>
  Object.values(data.moneyAccounts)
    .filter((account) => account.kind === "bank" && account.currency === currency && !account.archivedAt)
    .reduce((total, account) => total + getMoneyAccountBalance(data, account.id), 0);

export const getTotalMoneyAvailable = (data: FinancialData, currency: Currency = "DOP"): number =>
  Object.values(data.moneyAccounts)
    .filter((account) => account.currency === currency && !account.archivedAt)
    .reduce((total, account) => total + getMoneyAccountBalance(data, account.id), 0);

export const hasInitializedMoneyAccounts = (data: FinancialData): boolean =>
  Object.keys(data.moneyAccounts).length > 0;

export const hasSelectableBankAccounts = (data: FinancialData, currency: Currency = "DOP"): boolean =>
  getActiveBankAccounts(data, currency).length > 0;

export const isSelectableMoneyAccount = (
  data: FinancialData,
  accountId: MoneyAccountId | undefined,
  method: "cash" | "bankTransfer" | "debitCard",
  currency: Currency = "DOP",
): boolean => {
  if (!accountId) return false;
  const account = data.moneyAccounts[accountId];
  if (!account || account.currency !== currency || !account.active || account.archivedAt) return false;
  if (method === "cash") return account.id === CASH_ACCOUNT_ID && account.kind === "cash";
  return account.kind === "bank"
    && account.id !== LEGACY_BANK_ACCOUNT_ID
    && Boolean(account.bankId && data.banks[account.bankId]?.active);
};

export const moneyAccountLabel = (id: MoneyAccountId, data?: FinancialData): string => {
  if (id === CASH_ACCOUNT_ID) return "Efectivo";
  if (id === LEGACY_BANK_ACCOUNT_ID) return "Saldo bancario sin distribuir";
  const account = data?.moneyAccounts[id];
  if (!account) return id;
  const bank = account.bankId ? data?.banks[account.bankId] : undefined;
  const suffix = account.lastFour ? ` · •••• ${account.lastFour}` : "";
  return `${bank?.name ? `${bank.name} · ` : ""}${account.name}${suffix}`;
};

export const getLegacyBankBalance = (data: FinancialData): number =>
  data.moneyAccounts[LEGACY_BANK_ACCOUNT_ID]
    ? getMoneyAccountBalance(data, LEGACY_BANK_ACCOUNT_ID)
    : 0;

export const calculateTransferFeeMinor = (amountMinor: number, ratePercent: number): number =>
  Math.max(0, Math.round(amountMinor * Math.max(0, ratePercent) / 100));
