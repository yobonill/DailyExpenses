import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { clearDraft, readDraft, storeDraft } from "../lib/localState";
import { formatMoney, parseMoneyToCents } from "../lib/money";
import type { NewExpenseInput } from "../hooks/useExpenses";

interface CaptureViewProps {
  onCreate: (input: NewExpenseInput) => Promise<unknown>;
  onSaved: () => void;
}

export function CaptureView({ onCreate, onSaved }: CaptureViewProps) {
  const initialDraft = useMemo(readDraft, []);
  const [name, setName] = useState(initialDraft.name);
  const [price, setPrice] = useState(initialDraft.price);
  const [quantity, setQuantity] = useState(initialDraft.quantity || "1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const cleanName = name.trim();
  const unitPriceCents = parseMoneyToCents(price);
  const quantityNumber = Number(quantity);
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber > 0;
  const showPrice = cleanName.length > 0;
  const showQuantity = showPrice && unitPriceCents !== null;
  const canSave = showQuantity && validQuantity && !saving;
  const totalCents = unitPriceCents && validQuantity ? unitPriceCents * quantityNumber : 0;

  useEffect(() => {
    storeDraft({ name, price, quantity });
  }, [name, price, quantity]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const reset = () => {
    setName("");
    setPrice("");
    setQuantity("1");
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
    target: "price" | "quantity" | "save",
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (target === "price" && cleanName) priceRef.current?.focus();
    if (target === "quantity" && unitPriceCents !== null) quantityRef.current?.focus();
    if (target === "save" && canSave) void submit();
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
                <span aria-hidden="true">RD$</span>
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
                  enterKeyHint="done"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  onKeyDown={(event) => moveOnEnter(event, "save")}
                />
              </label>

              <div className="capture-total" aria-live="polite">
                <span>Total</span>
                <strong>{formatMoney(totalCents)}</strong>
              </div>

              <button className="button button-primary capture-submit" type="submit" disabled={!canSave}>
                {saving ? "Guardando…" : "Guardar gasto"}
              </button>
            </>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}
