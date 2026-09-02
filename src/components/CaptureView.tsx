import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { clearDraft, readDraft, storeDraft } from "../lib/localState";
import { formatMoney, parseMoneyToCents } from "../lib/money";
import { EXPENSE_CATEGORIES } from "../config/financeCategories";
import type { NewExpenseInput } from "../hooks/useExpenses";
import type { ExpenseCurrency, ExpensePaymentMethod } from "../models/expense";

interface CaptureViewProps {
  onCreate: (input: NewExpenseInput) => Promise<unknown>;
  onSaved: () => void;
  activeCardName?: string;
}

const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Efectivo",
  debit: "Tarjeta de débito",
  transfer: "Transferencia",
  creditCard: "Tarjeta de crédito",
};

export function CaptureView({ onCreate, onSaved, activeCardName }: CaptureViewProps) {
  const initialDraft = useMemo(readDraft, []);
  const [name, setName] = useState(initialDraft.name);
  const [price, setPrice] = useState(initialDraft.price);
  const [quantity, setQuantity] = useState(initialDraft.quantity || "1");
  const [category, setCategory] = useState(initialDraft.category);
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(initialDraft.paymentMethod);
  const [currency, setCurrency] = useState<ExpenseCurrency>(initialDraft.currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);

  const cleanName = name.trim();
  const unitPriceCents = parseMoneyToCents(price);
  const quantityNumber = Number(quantity);
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const showPrice = cleanName.length > 0;
  const showQuantity = showPrice && unitPriceCents !== null;
  const cardReady = paymentMethod !== "creditCard" || Boolean(activeCardName);
  const canSave = showQuantity && validQuantity && cardReady && !saving;
  const totalCents = unitPriceCents && validQuantity ? unitPriceCents * quantityNumber : 0;

  useEffect(() => {
    storeDraft({ name, price, quantity, category, currency, paymentMethod });
  }, [category, currency, name, paymentMethod, price, quantity]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const reset = () => {
    setName("");
    setPrice("");
    setQuantity("1");
    setCategory("");
    setPaymentMethod("cash");
    setCurrency("DOP");
    clearDraft();
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSave || unitPriceCents === null) return;

    setSaving(true);
    setError("");
    try {
      await onCreate({
        name: cleanName,
        unitPriceCents,
        quantity: quantityNumber,
        category,
        currency: paymentMethod === "creditCard" ? currency : "DOP",
        paymentMethod,
      });
      reset();
      onSaved();
    } catch {
      setError("No se pudo guardar en este dispositivo. El formulario se mantuvo intacto.");
    } finally {
      setSaving(false);
    }
  };

  const moveOnEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    target: "price" | "quantity" | "payment",
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (target === "price" && cleanName) priceRef.current?.focus();
    if (target === "quantity" && unitPriceCents !== null) quantityRef.current?.focus();
    if (target === "payment" && validQuantity) paymentRef.current?.focus();
  };

  return (
    <section className="capture-view" aria-labelledby="capture-title">
      <div className="capture-heading">
        <span className="eyebrow">Nuevo gasto</span>
        <h1 id="capture-title">¿Qué compraste?</h1>
      </div>

      <form className="capture-form" onSubmit={submit}>
        <label className="capture-field capture-name-field">
          <span>Nombre del gasto</span>
          <input
            ref={nameRef}
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => moveOnEnter(event, "price")}
            placeholder="Ej. Domino Pizza"
          />
        </label>

        <div className={`progressive-field ${showPrice ? "revealed" : ""}`} aria-hidden={!showPrice}>
          {showPrice && (
            <label className="capture-field">
              <span>Precio unitario</span>
              <div className="money-input-wrap">
                <span aria-hidden="true">{paymentMethod === "creditCard" && currency === "USD" ? "US$" : "RD$"}</span>
                <input
                  ref={priceRef}
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  onKeyDown={(event) => moveOnEnter(event, "quantity")}
                  placeholder="0.00"
                />
              </div>
            </label>
          )}
        </div>

        <div className={`progressive-field ${showQuantity ? "revealed" : ""}`} aria-hidden={!showQuantity}>
          {showQuantity && (
            <>
              <label className="capture-field quantity-field">
                <span>Cantidad</span>
                <input
                  ref={quantityRef}
                  type="number"
                  inputMode="numeric"
                  enterKeyHint="next"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  onKeyDown={(event) => moveOnEnter(event, "payment")}
                />
              </label>

              <label className="capture-field">
                <span>¿Cómo lo pagaste?</span>
                <select
                  ref={paymentRef}
                  value={paymentMethod}
                  onChange={(event) => {
                    const next = event.target.value as ExpensePaymentMethod;
                    setPaymentMethod(next);
                    if (next !== "creditCard") setCurrency("DOP");
                  }}
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[]).map((method) => (
                    <option value={method} key={method}>{PAYMENT_METHOD_LABELS[method]}</option>
                  ))}
                </select>
              </label>

              {paymentMethod === "creditCard" && (
                <>
                  <label className="capture-field">
                    <span>Moneda del cargo</span>
                    <select value={currency} onChange={(event) => setCurrency(event.target.value as ExpenseCurrency)}>
                      <option value="DOP">Pesos dominicanos (DOP)</option>
                      <option value="USD">Dólares estadounidenses (USD)</option>
                    </select>
                  </label>
                  {activeCardName
                    ? <p className="capture-card-note">Se agregará automáticamente a {activeCardName}. El efectivo se descontará cuando registres el pago de la tarjeta.</p>
                    : <p className="form-error" role="alert">Configura una tarjeta activa antes de registrar una compra con crédito.</p>}
                </>
              )}

              <label className="capture-field">
                <span>Categoría (opcional)</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Sin categoría</option>
                  {EXPENSE_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>

              <div className="capture-total" aria-live="polite">
                <span>Total</span>
                <strong>{currency === "USD" && paymentMethod === "creditCard" ? `US$${(totalCents / 100).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatMoney(totalCents)}</strong>
              </div>

              <button className="button button-primary capture-submit" type="submit" disabled={!canSave}>
                {saving ? "Registrando…" : "Registrar gasto"}
              </button>
            </>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}
