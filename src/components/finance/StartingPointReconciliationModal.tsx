import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { formatMonthTitle, formatShortDate, toLocalDateKey } from "../../lib/date";
import { getCardCurrentDebt } from "../../lib/financialCalculations";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type {
  FinancialData,
  HistoricalPaymentSource,
  IncomeOccurrence,
  MonthlyExpenseOccurrence,
} from "../../models/finance";
import type { StartingPointReconciliationInput } from "../../lib/startingPointReconciliation";
import { Modal } from "./Shared";

interface SelectableAmount {
  selected: boolean;
  amount: string;
}

const initialSelections = (
  items: Array<MonthlyExpenseOccurrence | IncomeOccurrence>,
): Record<string, SelectableAmount> => Object.fromEntries(items.map((item) => [
  item.id,
  { selected: false, amount: minorToInput(item.expectedAmountMinor) },
]));

const updateEverySelection = (
  current: Record<string, SelectableAmount>,
  selected: boolean,
): Record<string, SelectableAmount> => Object.fromEntries(
  Object.entries(current).map(([id, value]) => [id, { ...value, selected }]),
);

export function StartingPointReconciliationModal({ data, monthKey, quincena, onConfirm, onClose }: {
  data: FinancialData;
  monthKey: string;
  quincena: "all" | 1 | 2;
  onConfirm: (input: StartingPointReconciliationInput) => Promise<void>;
  onClose: () => void;
}) {
  const bills = useMemo(() => Object.values(data.monthlyOccurrences)
    .filter((item) => item.financialMonth === monthKey
      && item.status === "upcoming"
      && (quincena === "all" || item.quincena === quincena))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, "es")), [data.monthlyOccurrences, monthKey, quincena]);
  const expectedIncome = useMemo(() => Object.values(data.incomeOccurrences)
    .filter((item) => item.financialMonth === monthKey
      && item.status === "expected"
      && (quincena === "all" || item.quincena === quincena))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || a.name.localeCompare(b.name, "es")), [data.incomeOccurrences, monthKey, quincena]);
  const receivedIncomeCount = useMemo(() => Object.values(data.incomeOccurrences)
    .filter((item) => item.financialMonth === monthKey
      && item.status === "received"
      && (quincena === "all" || item.quincena === quincena)).length, [data.incomeOccurrences, monthKey, quincena]);
  const activeCard = Object.values(data.creditCards).find((card) => card.active && !card.archivedAt)
    || Object.values(data.creditCards).find((card) => !card.archivedAt);
  const existingStartDate = data.settings.trackingStartDate;
  const [trackingStartDate, setTrackingStartDate] = useState(existingStartDate || toLocalDateKey());
  const [historicalSource, setHistoricalSource] = useState<HistoricalPaymentSource>("unknown");
  const [billSelections, setBillSelections] = useState(() => initialSelections(bills));
  const [incomeSelections, setIncomeSelections] = useState(() => initialSelections(expectedIncome));
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedBillCount = Object.values(billSelections).filter((item) => item.selected).length;
  const selectedIncomeCount = Object.values(incomeSelections).filter((item) => item.selected).length;

  const changeSelection = (
    setter: Dispatch<SetStateAction<Record<string, SelectableAmount>>>,
    id: string,
    patch: Partial<SelectableAmount>,
  ) => setter((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!acknowledged) return setError("Confirma que entiendes cómo se conservarán los saldos actuales.");
    const selectedBills = bills.filter((item) => billSelections[item.id]?.selected).map((item) => ({
      occurrenceId: item.id,
      amountMinor: parseMoneyToCents(billSelections[item.id].amount) || 0,
    }));
    const selectedIncomes = expectedIncome.filter((item) => incomeSelections[item.id]?.selected).map((item) => ({
      occurrenceId: item.id,
      amountMinor: parseMoneyToCents(incomeSelections[item.id].amount) || 0,
    }));
    if (!selectedBills.length && !selectedIncomes.length) return setError("Selecciona al menos una factura o un ingreso.");
    const invalidBill = selectedBills.find((item) => item.amountMinor <= 0);
    const invalidIncome = selectedIncomes.find((item) => item.amountMinor <= 0);
    if (invalidBill || invalidIncome) return setError("Revisa los montos seleccionados.");
    if (historicalSource === "creditCardOpeningBalance" && !activeCard) return setError("No hay una tarjeta configurada para usar ese origen.");
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        trackingStartDate,
        historicalSource,
        cardId: historicalSource === "creditCardOpeningBalance" ? activeCard?.id : undefined,
        bills: selectedBills,
        incomes: selectedIncomes,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la reconciliación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={existingStartDate ? "Completar reconciliación inicial" : "Establecer punto de inicio"} onClose={onClose} wide confirmClose>
      <form className="form-grid" onSubmit={submit}>
        <p className="privacy-note">Usa las facturas e ingresos que ya registraste. Los elementos seleccionados quedarán completados como históricos, sin generar cargos de tarjeta, retiros de ahorros ni nuevas salidas de efectivo.</p>
        <label className="field"><span>Seguimiento exacto desde</span><input type="date" max={toLocalDateKey()} value={trackingStartDate} disabled={Boolean(existingStartDate)} onChange={(event) => setTrackingStartDate(event.target.value)} /><small className="field-help">{existingStartDate ? "Esta fecha ya quedó fijada durante la primera reconciliación." : "Los movimientos normales registrados después de establecer este punto sí afectarán sus balances."}</small></label>

        {activeCard && <section className="reconciliation-balance-card"><div><span>Deuda actual registrada DOP</span><strong>{formatCurrency(getCardCurrentDebt(data, activeCard.id, "DOP"), "DOP")}</strong></div><div><span>Deuda actual registrada USD</span><strong>{formatCurrency(getCardCurrentDebt(data, activeCard.id, "USD"), "USD")}</strong></div><p>La reconciliación no modificará estos balances.</p></section>}

        <label className="field"><span>Origen de las facturas anteriores</span><select value={historicalSource} onChange={(event) => setHistoricalSource(event.target.value as HistoricalPaymentSource)}><option value="unknown">No especificar</option><option value="creditCardOpeningBalance" disabled={!activeCard}>Tarjeta · ya incluido en la deuda registrada</option><option value="cashOrBankBeforeTracking">Efectivo, débito o transferencia · ya pagado</option></select><small className="field-help">Si las facturas tuvieron distintos métodos o no quieres reconstruirlos, deja “No especificar”. Ninguna opción modifica los balances actuales.</small></label>

        <section className="reconciliation-group"><div className="reconciliation-heading"><div><h3>Facturas pendientes · {formatMonthTitle(monthKey)}{quincena === "all" ? "" : ` · Q${quincena}`}</h3><small>{selectedBillCount} seleccionadas de {bills.length}</small></div>{bills.length > 0 && <div className="inline-actions"><button type="button" onClick={() => setBillSelections((current) => updateEverySelection(current, true))}>Seleccionar todas</button><button type="button" onClick={() => setBillSelections((current) => updateEverySelection(current, false))}>Ninguna</button></div>}</div>{bills.length ? <div className="reconciliation-list">{bills.map((item) => { const selection = billSelections[item.id]; return <article className={selection.selected ? "selected" : ""} key={item.id}><label className="reconciliation-check"><input type="checkbox" checked={selection.selected} onChange={(event) => changeSelection(setBillSelections, item.id, { selected: event.target.checked })} /><span><strong>{item.name}</strong><small>{formatShortDate(item.dueDate)} · Q{item.quincena}{item.category ? ` · ${item.category}` : ""}</small></span></label><div className="money-input-wrap compact-money"><span aria-hidden="true">{item.currency === "USD" ? "US$" : "RD$"}</span><input aria-label={`Monto pagado de ${item.name}`} type="text" inputMode="decimal" disabled={!selection.selected} value={selection.amount} onChange={(event) => changeSelection(setBillSelections, item.id, { amount: event.target.value })} /></div></article>; })}</div> : <p className="muted-panel">No hay facturas pendientes en este período.</p>}</section>

        <section className="reconciliation-group"><div className="reconciliation-heading"><div><h3>Ingresos todavía esperados</h3><small>{receivedIncomeCount > 0 ? `${receivedIncomeCount} ya están registrados como recibidos y no serán modificados.` : `${selectedIncomeCount} seleccionados de ${expectedIncome.length}`}</small></div>{expectedIncome.length > 0 && <div className="inline-actions"><button type="button" onClick={() => setIncomeSelections((current) => updateEverySelection(current, true))}>Seleccionar todos</button><button type="button" onClick={() => setIncomeSelections((current) => updateEverySelection(current, false))}>Ninguno</button></div>}</div>{expectedIncome.length ? <div className="reconciliation-list">{expectedIncome.map((item) => { const selection = incomeSelections[item.id]; return <article className={selection.selected ? "selected" : ""} key={item.id}><label className="reconciliation-check"><input type="checkbox" checked={selection.selected} onChange={(event) => changeSelection(setIncomeSelections, item.id, { selected: event.target.checked })} /><span><strong>{item.name}</strong><small>{formatShortDate(item.expectedDate)} · Q{item.quincena}</small></span></label><div className="money-input-wrap compact-money"><span aria-hidden="true">{item.currency === "USD" ? "US$" : "RD$"}</span><input aria-label={`Monto recibido de ${item.name}`} type="text" inputMode="decimal" disabled={!selection.selected} value={selection.amount} onChange={(event) => changeSelection(setIncomeSelections, item.id, { amount: event.target.value })} /></div></article>; })}</div> : <p className="success-panel">No hay ingresos pendientes de confirmar en este período.</p>}</section>

        <label className="checkbox-field reconciliation-confirm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><strong>Confirmo que estos movimientos ocurrieron antes del inicio del seguimiento.</strong><small>Las facturas pasarán a Pagadas, pero no aumentarán la deuda registrada ni volverán a descontarse de efectivo o ahorros.</small></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Reconciliando…" : existingStartDate ? "Reconciliar seleccionados" : "Guardar punto de inicio"}</button></div>
      </form>
    </Modal>
  );
}
