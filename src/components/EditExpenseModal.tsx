import { useMemo, useState, type FormEvent } from "react";
import { EXPENSE_CATEGORIES, isPredefinedExpenseCategory } from "../config/financeCategories";
import type { Expense, ExpenseCurrency, ExpenseEditableFields, ExpensePaymentMethod } from "../models/expense";
import { parseMoneyToCents } from "../lib/money";

interface EditExpenseModalProps {
  expense: Expense;
  onClose: () => void;
  onSave: (
    expenseId: string,
    changes: ExpenseEditableFields,
  ) => Promise<void>;
  activeCardName?: string;
}

export function EditExpenseModal({ expense, onClose, onSave, activeCardName }: EditExpenseModalProps) {
  const initialPrice = useMemo(() => {
    const value = expense.unitPriceCents / 100;
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }, [expense.unitPriceCents]);

  const [name, setName] = useState(expense.name);
  const [price, setPrice] = useState(initialPrice);
  const [quantity, setQuantity] = useState(String(expense.quantity));
  const [date, setDate] = useState(expense.occurredDate);
  const [category, setCategory] = useState(expense.category || "");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(expense.paymentMethod || "cash");
  const [currency, setCurrency] = useState<ExpenseCurrency>(expense.currency || "DOP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unitPriceCents = parseMoneyToCents(price);
  const quantityNumber = Number(quantity);
  const canSave =
    name.trim().length > 0 &&
    unitPriceCents !== null &&
    Number.isInteger(quantityNumber) &&
    quantityNumber > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    (paymentMethod !== "creditCard" || Boolean(activeCardName)) &&
    !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || unitPriceCents === null) return;
    setSaving(true);
    setError("");
    try {
      await onSave(expense.id, {
        name: name.trim(),
        unitPriceCents,
        quantity: quantityNumber,
        occurredDate: date,
        category,
        paymentMethod,
        currency: paymentMethod === "creditCard" ? currency : "DOP",
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron guardar los cambios en este dispositivo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-expense-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" aria-hidden="true" />
        <div className="modal-header">
          <h2 id="edit-expense-title">Editar gasto</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <form className="edit-form" onSubmit={submit}>
          <label className="field">
            <span>Nombre</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Precio unitario</span>
            <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <label className="field">
            <span>Cantidad</span>
            <input type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="field">
            <span>Fecha del gasto</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Forma de pago</span>
            <select value={paymentMethod} onChange={(event) => {
              const next = event.target.value as ExpensePaymentMethod;
              setPaymentMethod(next);
              if (next !== "creditCard") setCurrency("DOP");
            }}>
              <option value="cash">Efectivo</option>
              <option value="debit">Tarjeta de débito</option>
              <option value="transfer">Transferencia</option>
              <option value="creditCard">Tarjeta de crédito</option>
            </select>
          </label>
          {paymentMethod === "creditCard" && <>
            <label className="field"><span>Moneda del cargo</span><select value={currency} onChange={(event) => setCurrency(event.target.value as ExpenseCurrency)}><option value="DOP">Pesos dominicanos (DOP)</option><option value="USD">Dólares estadounidenses (USD)</option></select></label>
            {activeCardName ? <p className="privacy-note">El cargo vinculado se actualizará en {activeCardName}.</p> : <p className="form-error">Configura una tarjeta activa para usar esta forma de pago.</p>}
          </>}
          <label className="field"><span>Categoría (opcional)</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Sin categoría</option>{category && !isPredefinedExpenseCategory(category) && <option value={category}>{category} (anterior)</option>}{EXPENSE_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="button button-primary" type="submit" disabled={!canSave}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      </section>
    </div>
  );
}
