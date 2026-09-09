import type { Bank, CreditCard, FinancialData, Loan, MoneyAccount, SavingsFund } from "../models/finance";
import { CASH_ACCOUNT_ID, getBankAccounts } from "./moneyLedger";

export interface BankProductGroup {
  bank: Bank;
  accounts: MoneyAccount[];
  savingsFunds: SavingsFund[];
  cards: CreditCard[];
  loans: Loan[];
}

export interface AccountCenterGroups {
  banks: BankProductGroup[];
  cashSavingsFunds: SavingsFund[];
  unassignedSavingsFunds: SavingsFund[];
  unassignedCards: CreditCard[];
  unassignedLoans: Loan[];
}

const visible = <T extends { archivedAt?: string }>(items: Record<string, T>): T[] =>
  Object.values(items).filter((item) => !item.archivedAt);

/**
 * Builds the presentation model for the centralized accounts area without moving
 * or rewriting any Firebase records. Existing IDs and ledgers remain authoritative.
 */
export function buildAccountCenterGroups(data: FinancialData): AccountCenterGroups {
  const banks = visible(data.banks).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const accounts = getBankAccounts(data);
  const savingsFunds = visible(data.savingsFunds);
  const cards = visible(data.creditCards);
  const loans = visible(data.loans);

  const bankGroups = banks.map((bank) => {
    const bankAccounts = accounts.filter((account) => account.bankId === bank.id);
    const accountIds = new Set(bankAccounts.map((account) => account.id));
    return {
      bank,
      accounts: bankAccounts,
      savingsFunds: savingsFunds.filter((fund) => Boolean(fund.moneyAccountId && accountIds.has(fund.moneyAccountId))),
      cards: cards.filter((card) => card.bankId === bank.id),
      loans: loans.filter((loan) => loan.bankId === bank.id),
    };
  });

  const validBankIds = new Set(banks.map((bank) => bank.id));
  const assignedAccountIds = new Set(accounts.filter((account) => account.bankId && validBankIds.has(account.bankId)).map((account) => account.id));

  return {
    banks: bankGroups,
    cashSavingsFunds: savingsFunds.filter((fund) => fund.moneyAccountId === CASH_ACCOUNT_ID),
    unassignedSavingsFunds: savingsFunds.filter((fund) => !fund.moneyAccountId || (fund.moneyAccountId !== CASH_ACCOUNT_ID && !assignedAccountIds.has(fund.moneyAccountId))),
    unassignedCards: cards.filter((card) => !card.bankId || !validBankIds.has(card.bankId)),
    unassignedLoans: loans.filter((loan) => !loan.bankId || !validBankIds.has(loan.bankId)),
  };
}
