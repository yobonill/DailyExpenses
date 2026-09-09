import type { Currency, FinancialData, Loan, LoanTransaction } from "../models/finance";

const dateToUtc = (dateKey: string): number => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const daysBetweenDateKeys = (start: string, end: string): number =>
  Math.max(0, Math.round((dateToUtc(end) - dateToUtc(start)) / 86_400_000));

export const getLoanTransactionEffect = (transaction: LoanTransaction): number => {
  if (transaction.type === "payment") return -(transaction.principalMinor || 0);
  return transaction.adjustmentMinor || 0;
};

export const getLoanBalance = (data: FinancialData, loanId: string, endDate?: string): number => {
  const loan = data.loans[loanId];
  if (!loan || (endDate && endDate < loan.openingDate)) return 0;
  return Math.max(0, Object.values(data.loanTransactions)
    .filter((transaction) => transaction.loanId === loanId
      && !transaction.reversedAt
      && (!endDate || transaction.transactionDate <= endDate))
    .reduce((total, transaction) => total + getLoanTransactionEffect(transaction), loan.openingBalanceMinor));
};

export const getLoanLastBalanceDate = (data: FinancialData, loan: Loan, paymentDate: string): string =>
  Object.values(data.loanTransactions)
    .filter((transaction) => transaction.loanId === loan.id
      && !transaction.reversedAt
      && transaction.transactionDate <= paymentDate)
    .map((transaction) => transaction.transactionDate)
    .concat(loan.openingDate)
    .sort()
    .at(-1) || loan.openingDate;

export const estimateLoanInterestMinor = (data: FinancialData, loanId: string, paymentDate: string): number => {
  const loan = data.loans[loanId];
  if (!loan || loan.annualInterestRate <= 0) return 0;
  const balance = getLoanBalance(data, loanId, paymentDate);
  const days = daysBetweenDateKeys(getLoanLastBalanceDate(data, loan, paymentDate), paymentDate);
  return Math.max(0, Math.round(balance * (loan.annualInterestRate / 100) * (days / 365)));
};

export const getTotalLoanDebt = (data: FinancialData, currency: Currency): number =>
  Object.values(data.loans)
    .filter((loan) => !loan.archivedAt && loan.currency === currency)
    .reduce((total, loan) => total + getLoanBalance(data, loan.id), 0);

