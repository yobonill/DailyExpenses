import { useEffect, useState } from "react";
import type {
  BankInput,
  CreditCardInput,
  LoanInput,
  MoneyAccountInput,
  SavingsFundInput,
} from "../../hooks/useFinanceActions";
import type {
  FinancialData,
  MoneyAccountId,
  SavingsTransaction,
} from "../../models/finance";
import type { SavingsAccountReconciliationInput } from "../../lib/savingsAccountReconciliation";
import { CreditCardsView, type AddCardTransaction } from "./CreditCardsView";
import { LoansView } from "./LoansView";
import { MoneyView } from "./MoneyView";
import { SavingsView } from "./SavingsView";

export type FinancialHubSection = "overview" | "savings" | "cards" | "loans";

interface FinancialHubViewProps {
  data: FinancialData;
  canReconcileSavingsAccounts: boolean;
  initialSection?: FinancialHubSection;
  onSaveBank: (input: BankInput, id?: string) => Promise<void>;
  onDeleteBank: (bankId: string) => Promise<void>;
  onSaveAccount: (input: MoneyAccountInput, id?: string) => Promise<void>;
  onInitializeCash: (balance: number, date: string) => Promise<void>;
  onAdjustAccount: (accountId: MoneyAccountId, exact: number, date: string, notes?: string) => Promise<void>;
  onTransferMoney: (from: MoneyAccountId, to: MoneyAccountId, amount: number, date: string, fee: number, notes?: string) => Promise<void>;
  onReconcileSavingsAccounts: (input: SavingsAccountReconciliationInput) => Promise<void>;
  onSaveSavingsFund: (input: SavingsFundInput, id?: string) => Promise<void>;
  onAddSavingsTransaction: (fundId: string, type: SavingsTransaction["type"], amount: number, date: string, notes?: string) => Promise<void>;
  onTransferSavings: (fromId: string, toId: string, amount: number, date: string) => Promise<void>;
  onReleaseSavings: (id: string) => Promise<void>;
  onSaveCard: (input: CreditCardInput, id?: string) => Promise<void>;
  onSaveCardMinimum: (statementId: string, minimumPaymentMinor: number) => Promise<void>;
  onAddCardTransaction: AddCardTransaction;
  onReverseCardTransaction: (id: string) => Promise<void>;
  onSaveLoan: (input: LoanInput, id?: string) => Promise<void>;
  onAdjustLoan: (loanId: string, exact: number, date: string, notes?: string) => Promise<void>;
  onReverseLoanAdjustment: (transactionId: string) => Promise<void>;
}

const sections: Array<{ id: FinancialHubSection; label: string }> = [
  { id: "overview", label: "Resumen" },
  { id: "savings", label: "Ahorros" },
  { id: "cards", label: "Tarjeta" },
  { id: "loans", label: "Préstamos" },
];

export function FinancialHubView({
  data,
  canReconcileSavingsAccounts,
  initialSection = "overview",
  onSaveBank,
  onDeleteBank,
  onSaveAccount,
  onInitializeCash,
  onAdjustAccount,
  onTransferMoney,
  onReconcileSavingsAccounts,
  onSaveSavingsFund,
  onAddSavingsTransaction,
  onTransferSavings,
  onReleaseSavings,
  onSaveCard,
  onSaveCardMinimum,
  onAddCardTransaction,
  onReverseCardTransaction,
  onSaveLoan,
  onAdjustLoan,
  onReverseLoanAdjustment,
}: FinancialHubViewProps) {
  const [section, setSection] = useState<FinancialHubSection>(initialSection);

  useEffect(() => setSection(initialSection), [initialSection]);

  return <div className="financial-hub-shell">
    <section className="financial-hub-header" aria-labelledby="financial-hub-title">
      <div><span className="eyebrow">Todo en un solo lugar</span><h1 id="financial-hub-title">Cuentas y productos</h1></div>
      <nav className="financial-hub-tabs" aria-label="Áreas de cuentas y productos">
        {sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}
      </nav>
    </section>

    {section === "overview" && <MoneyView
      data={data}
      canReconcile={canReconcileSavingsAccounts}
      onSaveBank={onSaveBank}
      onDeleteBank={onDeleteBank}
      onSaveAccount={onSaveAccount}
      onInitializeCash={onInitializeCash}
      onAdjust={onAdjustAccount}
      onTransfer={onTransferMoney}
      onReconcileSavingsAccounts={onReconcileSavingsAccounts}
      onOpenSection={setSection}
    />}
    {section === "savings" && <SavingsView data={data} onSave={onSaveSavingsFund} onAddTransaction={onAddSavingsTransaction} onTransfer={onTransferSavings} onRelease={onReleaseSavings} />}
    {section === "cards" && <CreditCardsView data={data} onSaveCard={onSaveCard} onSaveMinimum={onSaveCardMinimum} onAddTransaction={onAddCardTransaction} onReverseTransaction={onReverseCardTransaction} />}
    {section === "loans" && <LoansView data={data} onSave={onSaveLoan} onAdjust={onAdjustLoan} onReverseAdjustment={onReverseLoanAdjustment} />}
  </div>;
}
