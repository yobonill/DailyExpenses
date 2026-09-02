import { useMemo, useState, type FormEvent } from "react";
import type { CreditCardInput } from "../../hooks/useFinanceActions";
import type {
  CardTransaction,
  CardStatement,
  CreditCard,
  Currency,
  FinancialData,
} from "../../models/finance";
import { formatShortDate, toLocalDateKey } from "../../lib/date";
import {
  deriveDatedStatus,
  getCardMinimumPaymentProgress,
  getCardCurrentDebt,
  getCardSavingsCoverage,
  getStatementRemaining,
  getUsdPaymentEffectiveRate,
  latestStatements,
  minimumPaymentStatusLabel,
  statusLabel,
} from "../../lib/financialCalculations";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import {
  CheckboxField,
  CurrencyField,
  EmptyPanel,
  Modal,
  MoneyField,
  PageHeading,
  StatusChip,
} from "./Shared";

type AddCardTransaction = (
  cardId: string,
  currency: Currency,
  type: CardTransaction["type"],
  amount: number,
  date: string,
  description: string,
  savingsFundId?: string,
  settlementAmountDopMinor?: number,
  affectsCurrentBalance?: boolean,
) => Promise<void>;

const formatExchangeRate = (rate: number): string => new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
}).format(rate);

const minimumChipStatus = (status: ReturnType<typeof getCardMinimumPaymentProgress>["status"]): string => {
  if (status === "paidOnTime") return "paid";
  if (status === "paidLate" || status === "overdue") return "overdue";
  if (status === "dueSoon" || status === "dueToday") return status;
  if (status === "notConfigured") return "partial";
  return "upcoming";
};

function MinimumPaymentModal({ statement, onSave, onClose }: {
  statement: CardStatement;
  onSave: (statementId: string, minimumPaymentMinor: number) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(minorToInput(statement.minimumPaymentMinor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseMoneyToCents(amount);
    if (amount.trim() && !parsed) {
      setError("Escribe un monto válido o deja el campo vacío para quitarlo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(statement.id, parsed || 0);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el pago mínimo.");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={`Pago mínimo · ${statement.currency}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><p className="privacy-note">Copia el pago mínimo exacto que aparece en el estado de cuenta con corte {formatShortDate(statement.cutDate)}. No es un porcentaje fijo: el banco suma intereses, comisiones, cargos, capital vigente dividido entre 36 y cualquier capital vencido.</p><MoneyField label="Pago mínimo indicado por el banco" value={amount} onChange={setAmount} currency={statement.currency} required={false} /><p className="field-help">La app marcará el mínimo como cumplido automáticamente al registrar pagos de esta moneda después del corte. Déjalo vacío para eliminar un valor incorrecto.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar pago mínimo"}</button></div></form></Modal>;
}

function CardForm({
  card,
  onSave,
  onClose,
}: {
  card?: CreditCard;
  onSave: (input: CreditCardInput, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(card?.name || "");
  const [bank, setBank] = useState(card?.bank || "");
  const [lastFour, setLastFour] = useState(card?.lastFour || "");
  const [cutDay, setCutDay] = useState(String(card?.cutDay || 15));
  const [dueDay, setDueDay] = useState(String(card?.dueDay || 10));
  const [active, setActive] = useState(card?.active ?? true);
  const [openingDate, setOpeningDate] = useState(card?.openingDate || toLocalDateKey());
  const [currentDop, setCurrentDop] = useState(minorToInput(card?.openingCurrentDebtDopMinor));
  const [currentUsd, setCurrentUsd] = useState(minorToInput(card?.openingCurrentDebtUsdMinor));
  const [statementDop, setStatementDop] = useState(minorToInput(card?.openingStatementDopMinor));
  const [statementUsd, setStatementUsd] = useState(minorToInput(card?.openingStatementUsdMinor));
  const [limitDop, setLimitDop] = useState(minorToInput(card?.creditLimitDopMinor));
  const [limitUsd, setLimitUsd] = useState(minorToInput(card?.creditLimitUsdMinor));
  const [notes, setNotes] = useState(card?.notes || "");
  const [error, setError] = useState("");
  const optional = (value: string) => value ? parseMoneyToCents(value) ?? undefined : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cut = Number(cutDay);
    const due = Number(dueDay);
    if (!name.trim() || cut < 1 || cut > 31 || due < 1 || due > 31) {
      setError("Completa el nombre y usa días entre 1 y 31.");
      return;
    }
    try {
      await onSave({
        name,
        bank,
        lastFour,
        cutDay: cut,
        dueDay: due,
        active,
        openingDate,
        openingCurrentDebtDopMinor: optional(currentDop) || 0,
        openingCurrentDebtUsdMinor: optional(currentUsd) || 0,
        openingStatementDopMinor: optional(statementDop) || 0,
        openingStatementUsdMinor: optional(statementUsd) || 0,
        creditLimitDopMinor: optional(limitDop),
        creditLimitUsdMinor: optional(limitUsd),
        notes,
      }, card?.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la tarjeta.");
    }
  };

  return (
    <Modal title={card ? "Editar tarjeta" : "Nueva tarjeta"} onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <div className="form-columns">
          <label className="field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span>Banco (opcional)</span><input value={bank} onChange={(event) => setBank(event.target.value)} /></label>
        </div>
        <div className="form-columns">
          <label className="field"><span>Últimos 4 (opcional)</span><input inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Fecha inicial</span><input type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} /></label>
        </div>
        <div className="form-columns">
          <label className="field"><span>Día de corte</span><input type="number" min="1" max="31" value={cutDay} onChange={(event) => setCutDay(event.target.value)} /></label>
          <label className="field"><span>Día límite de pago</span><input type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
        </div>
        <h3 className="form-section-title">Balances iniciales</h3>
        <div className="form-columns">
          <MoneyField label="Deuda actual DOP" value={currentDop} onChange={setCurrentDop} />
          <MoneyField label="Estado pendiente DOP" value={statementDop} onChange={setStatementDop} />
        </div>
        <div className="form-columns">
          <MoneyField label="Deuda actual USD" value={currentUsd} onChange={setCurrentUsd} currency="USD" />
          <MoneyField label="Estado pendiente USD" value={statementUsd} onChange={setStatementUsd} currency="USD" />
        </div>
        <h3 className="form-section-title">Límites informativos</h3>
        <div className="form-columns">
          <MoneyField label="Límite DOP" value={limitDop} onChange={setLimitDop} required={false} />
          <MoneyField label="Límite USD" value={limitUsd} onChange={setLimitUsd} currency="USD" required={false} />
        </div>
        <CheckboxField checked={active} onChange={setActive} label="Tarjeta activa" />
        <label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <p className="privacy-note">Guarda solo el nombre y, si quieres, los últimos cuatro dígitos. Nunca registres el número completo, CVV, PIN o contraseña.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button className="button button-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function CardTransactionModal({
  data,
  card,
  initialType,
  onSave,
  onClose,
}: {
  data: FinancialData;
  card: CreditCard;
  initialType: CardTransaction["type"];
  onSave: AddCardTransaction;
  onClose: () => void;
}) {
  const [type, setType] = useState<CardTransaction["type"]>(initialType);
  const [currency, setCurrency] = useState<Currency>("DOP");
  const [amount, setAmount] = useState("");
  const [settlementDop, setSettlementDop] = useState("");
  const [date, setDate] = useState(toLocalDateKey());
  const [description, setDescription] = useState(initialType === "payment" ? "Pago de tarjeta" : "");
  const [savingsFundId, setSavingsFundId] = useState("");
  const [includedInCurrentBalance, setIncludedInCurrentBalance] = useState(false);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"increase" | "decrease">("increase");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const paymentSourceCurrency: Currency = type === "payment" && currency === "USD" ? "DOP" : currency;
  const funds = Object.values(data.savingsFunds)
    .filter((fund) => fund.active && !fund.archivedAt && fund.currency === paymentSourceCurrency);
  const currentDebt = getCardCurrentDebt(data, card.id, currency);
  const parsedAmount = parseMoneyToCents(amount);
  const parsedSettlementDop = parseMoneyToCents(settlementDop);
  const effectiveRate = type === "payment" && currency === "USD" && parsedAmount && parsedSettlementDop
    ? parsedSettlementDop / parsedAmount
    : null;

  const changeType = (nextType: CardTransaction["type"]) => {
    setType(nextType);
    setSavingsFundId("");
    if (nextType !== "payment") setIncludedInCurrentBalance(false);
    if (nextType !== "payment") setSettlementDop("");
  };

  const changeCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    setSavingsFundId("");
    if (nextCurrency !== "USD") setSettlementDop("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsedAmount || !description.trim()) {
      setError("Completa monto y descripción.");
      return;
    }
    if (type === "payment" && !includedInCurrentBalance && parsedAmount > currentDebt) {
      setError("El pago no puede exceder la deuda pendiente.");
      return;
    }
    if (type === "payment" && currency === "USD" && !parsedSettlementDop) {
      setError("Escribe cuánto se pagó realmente en pesos dominicanos.");
      return;
    }
    const signed = type === "adjustment" && adjustmentDirection === "decrease"
      ? -parsedAmount
      : parsedAmount;
    setSaving(true);
    setError("");
    try {
      await onSave(
        card.id,
        currency,
        type,
        signed,
        date,
        description,
        type === "payment" ? savingsFundId || undefined : undefined,
        type === "payment" && currency === "USD" ? parsedSettlementDop || undefined : undefined,
        type === "payment" ? !includedInCurrentBalance : undefined,
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${initialType === "payment" ? "Pagar" : "Movimiento"} · ${card.name}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field"><span>Tipo</span><select value={type} onChange={(event) => changeType(event.target.value as CardTransaction["type"])}><option value="charge">Compra / cargo</option><option value="payment">Pago</option><option value="credit">Crédito / devolución</option><option value="adjustment">Ajuste</option></select></label>
        <CurrencyField value={currency} onChange={changeCurrency} label={type === "payment" ? "Moneda de la deuda" : "Moneda"} />
        {type === "payment" && (
          <div className="form-summary">
            <span>Deuda pendiente en {currency}</span>
            <strong>{formatCurrency(currentDebt, currency)}</strong>
          </div>
        )}
        {type === "adjustment" && (
          <fieldset className="choice-field"><legend>Dirección del ajuste</legend><label><input type="radio" checked={adjustmentDirection === "increase"} onChange={() => setAdjustmentDirection("increase")} /> Aumentar deuda</label><label><input type="radio" checked={adjustmentDirection === "decrease"} onChange={() => setAdjustmentDirection("decrease")} /> Reducir deuda</label></fieldset>
        )}
        <MoneyField label={type === "payment" ? `Deuda que se pagará en ${currency}` : "Monto"} value={amount} onChange={setAmount} currency={currency} />
        {type === "payment" && currency === "USD" && (
          <>
            <MoneyField label="Monto real pagado en pesos" value={settlementDop} onChange={setSettlementDop} currency="DOP" />
            <p className="privacy-note">
              {includedInCurrentBalance
                ? "Se conservará la deuda actual en USD y el pago histórico quedará registrado como salida en DOP."
                : "La deuda se reducirá en USD y la salida de dinero quedará registrada en DOP."}
              {effectiveRate && <> Tasa efectiva: <strong>RD${formatExchangeRate(effectiveRate)} por US$1</strong>.</>}
            </p>
          </>
        )}
        <label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => {
          const nextDate = event.target.value;
          setDate(nextDate);
          if (type === "payment") {
            const historical = nextDate <= card.openingDate;
            setIncludedInCurrentBalance(historical);
            if (historical) setSavingsFundId("");
          }
        }} /></label>
        <label className="field"><span>Descripción</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        {type === "payment" && <CheckboxField checked={includedInCurrentBalance} onChange={(checked) => {
          setIncludedInCurrentBalance(checked);
          if (checked) setSavingsFundId("");
        }} label="Este pago ya está incluido en la deuda actual" help="Úsalo para registrar un pago anterior al balance inicial. Contará para el pago mínimo, el historial y los reportes, pero no volverá a restarse de la deuda actual." />}
        {type === "payment" && !includedInCurrentBalance && (
          <label className="field"><span>Origen del pago (opcional)</span><select value={savingsFundId} onChange={(event) => setSavingsFundId(event.target.value)}><option value="">Efectivo / banco</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name} · {fund.currency}</option>)}</select><small className="field-help">{currency === "USD" ? "Si eliges un fondo, se retirará el monto real pagado en DOP." : "Si eliges un fondo, el retiro y la liberación de cobertura se registran juntos."}</small></label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function CreditCardsView({
  data,
  onSaveCard,
  onSaveMinimum,
  onAddTransaction,
  onReverseTransaction,
}: {
  data: FinancialData;
  onSaveCard: (input: CreditCardInput, id?: string) => Promise<void>;
  onSaveMinimum: (statementId: string, minimumPaymentMinor: number) => Promise<void>;
  onAddTransaction: AddCardTransaction;
  onReverseTransaction: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<CreditCard | "new" | null>(null);
  const [transaction, setTransaction] = useState<{ card: CreditCard; type: CardTransaction["type"] } | null>(null);
  const [minimumStatement, setMinimumStatement] = useState<CardStatement | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const cards = useMemo(
    () => Object.values(data.creditCards).filter((card) => !card.archivedAt).sort((a, b) => a.name.localeCompare(b.name)),
    [data.creditCards],
  );
  const statements = latestStatements(data);
  const today = toLocalDateKey();

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Deudas por moneda" title="Tarjeta" action={!cards.length ? <button className="button button-primary heading-action" type="button" onClick={() => setForm("new")}>＋ Configurar tarjeta</button> : undefined} />
      {!cards.length ? (
        <EmptyPanel title="Sin tarjetas" text="Registra una tarjeta con sus fechas de corte y pago. DOP y USD se manejarán por separado." />
      ) : (
        <div className="card-grid">
          {cards.map((card) => {
            const dopDebt = getCardCurrentDebt(data, card.id, "DOP");
            const usdDebt = getCardCurrentDebt(data, card.id, "USD");
            const dopCovered = getCardSavingsCoverage(data, card.id, "DOP");
            const usdCovered = getCardSavingsCoverage(data, card.id, "USD");
            const cardStatements = statements.filter((statement) => statement.cardId === card.id);
            const transactions = Object.values(data.cardTransactions)
              .filter((item) => item.cardId === card.id && !item.reversedAt)
              .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
            return (
              <article className="credit-card-panel" key={card.id}>
                <header><div><span>{card.bank || "Tarjeta"}{card.lastFour ? ` · •••• ${card.lastFour}` : ""}</span><h2>{card.name}</h2></div><StatusChip status={card.active ? "paid" : "cancelled"} label={card.active ? "Activa" : "Inactiva"} /></header>
                <div className="card-balance-grid">
                  <div><span>Deuda DOP</span><strong>{formatCurrency(dopDebt, "DOP")}</strong>{dopCovered > 0 && <small>{formatCurrency(dopCovered, "DOP")} cubierto por ahorros</small>}</div>
                  <div><span>Deuda USD</span><strong>{formatCurrency(usdDebt, "USD")}</strong>{usdCovered > 0 && <small>{formatCurrency(usdCovered, "USD")} cubierto por ahorros</small>}</div>
                </div>
                <div className="card-dates"><span>Corte: día {card.cutDay}</span><span>Pago: día {card.dueDay}</span></div>
                {cardStatements.map((statement) => {
                  const remaining = getStatementRemaining(data, statement);
                  const statementStatus = deriveDatedStatus({ status: remaining <= 0 ? "paid" : "upcoming", dueDate: statement.dueDate }, today, data.settings.dueSoonDaysCards);
                  const minimum = getCardMinimumPaymentProgress(data, statement, today, data.settings.dueSoonDaysCards);
                  const hasStatementDebt = (statement.correctedAmountMinor ?? statement.statementAmountMinor) > 0;
                  return <div className="statement-row" key={statement.id}><span><strong>Estado {statement.currency}</strong><small>Corte {formatShortDate(statement.cutDate)} · Vence {formatShortDate(statement.dueDate)}</small><small>Saldo pendiente: {formatCurrency(remaining, statement.currency)} · {statusLabel(statementStatus)}</small>{minimum.configured ? <small>Pago mínimo: {formatCurrency(minimum.requiredMinor, statement.currency)} · Pagado: {formatCurrency(minimum.paidMinor, statement.currency)} · Falta: {formatCurrency(minimum.remainingMinor, statement.currency)}</small> : hasStatementDebt && <small className="minimum-missing">Registra el pago mínimo indicado en el estado de cuenta.</small>}</span><span>{hasStatementDebt || minimum.configured ? <><StatusChip status={minimumChipStatus(minimum.status)} label={minimumPaymentStatusLabel(minimum.status)} /><button className="text-button" type="button" onClick={() => setMinimumStatement(statement)}>{minimum.configured ? "Editar mínimo" : "Registrar mínimo"}</button></> : <StatusChip status="paid" label="Sin saldo" />}</span></div>;
                })}
                <div className="row-actions">
                  <button className="button button-primary" type="button" onClick={() => setTransaction({ card, type: "payment" })}>Registrar pago</button>
                  <button className="button button-secondary" type="button" onClick={() => setTransaction({ card, type: "charge" })}>Movimiento</button>
                  <button className="button button-quiet" type="button" onClick={() => setForm(card)}>Editar</button>
                  <button className="button button-quiet" type="button" onClick={() => setExpanded(expanded === card.id ? null : card.id)}>Historial ({transactions.length})</button>
                </div>
                {expanded === card.id && (
                  <div className="ledger-list">
                    {transactions.length ? transactions.map((item) => {
                      const debtIncrease = item.type === "charge" || (item.type === "adjustment" && item.amountMinor > 0);
                      const effectiveRate = getUsdPaymentEffectiveRate(item);
                      return (
                        <div key={item.id}>
                          <span>
                            <strong>{item.description}</strong>
                            <small>{formatShortDate(item.transactionDate)} · {item.type === "charge" ? "Cargo" : item.type === "payment" ? "Pago" : item.type === "credit" ? "Crédito" : "Ajuste"}</small>
                            {item.type === "payment" && item.affectsCurrentBalance === false && <small>Histórico · ya incluido en la deuda actual</small>}
                            {item.settlementAmountDopMinor && <small>Salida real {formatCurrency(item.settlementAmountDopMinor, "DOP")}{effectiveRate ? ` · Tasa RD$${formatExchangeRate(effectiveRate)}/US$1` : ""}</small>}
                          </span>
                          <b className={debtIncrease ? "debt-up" : "debt-down"}>{debtIncrease ? "+" : "−"}{formatCurrency(Math.abs(item.amountMinor), item.currency)}</b>
                          {item.linkedDailyExpenseId ? <small>Gestionar desde Historial</small> : !item.linkedPaymentId && <button type="button" onClick={() => { if (window.confirm("¿Revertir este movimiento y sus efectos vinculados?")) void onReverseTransaction(item.id); }}>Revertir</button>}
                        </div>
                      );
                    }) : <p>Sin movimientos.</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {form && <CardForm card={form === "new" ? undefined : form} onSave={onSaveCard} onClose={() => setForm(null)} />}
      {minimumStatement && <MinimumPaymentModal statement={minimumStatement} onSave={onSaveMinimum} onClose={() => setMinimumStatement(null)} />}
      {transaction && <CardTransactionModal data={data} card={transaction.card} initialType={transaction.type} onSave={onAddTransaction} onClose={() => setTransaction(null)} />}
    </section>
  );
}
