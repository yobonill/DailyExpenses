import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EXPENSE_CATEGORIES } from "../config/financeCategories";
import { formatMonthTitle, formatShortDate } from "../lib/date";
import { formatCurrency } from "../lib/money";
import { CASH_ACCOUNT_ID, getActiveBankAccounts, moneyAccountLabel } from "../lib/moneyLedger";
import type { Expense, ExpenseEditableFields, ExpensePaymentMethod } from "../models/expense";
import type { FinancialData, Payment, PaymentMethod } from "../models/finance";
import { Modal } from "./finance/Shared";

type ClassificationMethod = ExpensePaymentMethod;
type ClassificationItem =
  | { kind: "historical"; key: string; payment: Payment; name: string; category: string; financialMonth?: string; quincena?: 1 | 2 }
  | { kind: "expense"; key: string; expense: Expense };

const toPaymentMethod = (method: ClassificationMethod): PaymentMethod => {
  if (method === "debit") return "debitCard";
  if (method === "transfer") return "bankTransfer";
  return method;
};

export function SpendingClassificationModal({ data, expenses, onClassifyHistorical, onEditExpense, onClose }: {
  data: FinancialData;
  expenses: Expense[];
  onClassifyHistorical: (paymentId: string, method: PaymentMethod, moneyAccountId?: string, cardId?: string) => Promise<void>;
  onEditExpense: (expenseId: string, changes: ExpenseEditableFields) => Promise<void>;
  onClose: () => void;
}) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState<ClassificationMethod | "">("");
  const [moneyAccountId, setMoneyAccountId] = useState("");
  const [cardId, setCardId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bankAccounts = useMemo(() => getActiveBankAccounts(data), [data]);
  const cards = useMemo(() => Object.values(data.creditCards).filter((card) => !card.archivedAt), [data.creditCards]);

  const items = useMemo<ClassificationItem[]>(() => {
    const historical = Object.values(data.payments)
      .filter((payment) => payment.historical && !payment.reversedAt && !payment.reportingMethod && payment.historicalSource !== "creditCardOpeningBalance")
      .map((payment): ClassificationItem => {
        const occurrence = payment.sourceType === "monthly"
          ? data.monthlyOccurrences[payment.sourceId]
          : data.nonMonthlyOccurrences[payment.sourceId];
        return {
          kind: "historical",
          key: `payment:${payment.id}`,
          payment,
          name: occurrence?.name || "Pago histórico",
          category: occurrence?.category || "Sin categoría",
          financialMonth: occurrence && "financialMonth" in occurrence ? occurrence.financialMonth : undefined,
          quincena: occurrence && "quincena" in occurrence ? occurrence.quincena : undefined,
        };
      });
    const incompleteExpenses = expenses
      .filter((expense) => !expense.deletedAt && !expense.category)
      .map((expense): ClassificationItem => ({ kind: "expense", key: `expense:${expense.id}`, expense }));
    return [...incompleteExpenses, ...historical].filter((item) => !completed.includes(item.key));
  }, [completed, data.monthlyOccurrences, data.nonMonthlyOccurrences, data.payments, expenses]);

  const current = items[0];
  useEffect(() => {
    setCategory("");
    setMethod("");
    setMoneyAccountId(bankAccounts[0]?.id || "");
    setCardId(cards[0]?.id || "");
    setError("");
  }, [bankAccounts, cards, current?.key]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || !method) return setError("Selecciona cómo se pagó.");
    if (current.kind === "expense" && !category) return setError("Selecciona una categoría.");
    if ((method === "debit" || method === "transfer") && !moneyAccountId) return setError("Selecciona la cuenta utilizada.");
    if (method === "creditCard" && !cardId) return setError("Selecciona la tarjeta utilizada.");
    setSaving(true);
    setError("");
    try {
      if (current.kind === "historical") {
        await onClassifyHistorical(
          current.payment.id,
          toPaymentMethod(method),
          method === "cash" ? CASH_ACCOUNT_ID : method === "debit" || method === "transfer" ? moneyAccountId : undefined,
          method === "creditCard" ? cardId : undefined,
        );
      } else {
        const expense = current.expense;
        await onEditExpense(expense.id, {
          name: expense.name,
          unitPriceCents: expense.unitPriceCents,
          quantity: expense.quantity,
          occurredDate: expense.occurredDate,
          category,
          currency: method === "creditCard" ? expense.currency || "DOP" : "DOP",
          paymentMethod: method,
          moneyAccountId: method === "cash" ? CASH_ACCOUNT_ID : method === "debit" || method === "transfer" ? moneyAccountId : undefined,
          transferFeeCents: method === "transfer" ? expense.transferFeeCents : undefined,
        });
      }
      setCompleted((value) => [...value, current.key]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la clasificación.");
    } finally {
      setSaving(false);
    }
  };

  if (!current) return <Modal title="Clasificación completada" onClose={onClose}><div className="classification-complete"><p>Todos los registros pendientes quedaron clasificados.</p><button type="button" className="button button-primary" onClick={onClose}>Cerrar</button></div></Modal>;

  const isHistorical = current.kind === "historical";
  const amountMinor = isHistorical ? current.payment.amountMinor : current.expense.unitPriceCents * current.expense.quantity;
  const currency = isHistorical ? current.payment.currency : current.expense.currency || "DOP";
  const title = isHistorical ? current.name : current.expense.name;

  return <Modal title="Completar clasificación" onClose={onClose} confirmClose>
    <form className="form-grid classification-form" onSubmit={submit}>
      <div className="classification-progress"><strong>{completed.length + 1} de {completed.length + items.length}</strong><span>{isHistorical ? "Pago histórico" : "Gasto extra"}</span></div>
      <div className="form-summary"><span>{title}</span><strong>{formatCurrency(amountMinor, currency)}</strong></div>
      {isHistorical ? <>
        <p className="classification-context">{current.category}{current.financialMonth ? ` · ${formatMonthTitle(current.financialMonth)}` : ""}{current.quincena ? ` · Q${current.quincena}` : ""}</p>
        <p className="privacy-note">La fecha exacta no fue registrada. Esta clasificación solo mejora el Historial; no altera saldos ni deudas.</p>
      </> : <>
        <p className="classification-context">Registrado {formatShortDate(current.expense.occurredDate)}. Método almacenado: {current.expense.paymentMethod === "creditCard" ? "Tarjeta de crédito" : current.expense.paymentMethod === "debit" ? "Tarjeta de débito" : current.expense.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"}.</p>
        <label className="field"><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)} required><option value="">Seleccionar categoría</option>{EXPENSE_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <p className="form-warning">Confirma nuevamente el método. Si eliges uno diferente al almacenado, la app corregirá el movimiento financiero relacionado.</p>
      </>}
      <label className="field"><span>¿Cómo se pagó?</span><select value={method} onChange={(event) => setMethod(event.target.value as ClassificationMethod)} required><option value="">Seleccionar forma de pago</option><option value="creditCard">Tarjeta de crédito</option><option value="debit">Tarjeta de débito</option><option value="transfer">Transferencia</option><option value="cash">Efectivo</option></select></label>
      {method === "creditCard" && <label className="field"><span>Tarjeta</span><select value={cardId} onChange={(event) => setCardId(event.target.value)}><option value="">Seleccionar tarjeta</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>}
      {(method === "debit" || method === "transfer") && <label className="field"><span>Banco y cuenta</span><select value={moneyAccountId} onChange={(event) => setMoneyAccountId(event.target.value)}><option value="">Seleccionar cuenta</option>{bankAccounts.map((account) => <option value={account.id} key={account.id}>{moneyAccountLabel(account.id, data)}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Continuar después</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar y continuar"}</button></div>
    </form>
  </Modal>;
}
