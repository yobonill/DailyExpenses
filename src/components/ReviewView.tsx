import { useMemo, useState } from "react";
import type { Expense, ExpenseEditableFields } from "../models/expense";
import type { Currency, FinancialData, PaymentMethod } from "../models/finance";
import {
  formatBudgetCycleRange,
  formatMonthTitle,
  formatQuincenaRange,
  formatShortDate,
  getBudgetCycleRange,
  getMonthKey,
  getQuincena,
  getQuincenaRange,
  toLocalDateKey,
  type Quincena,
} from "../lib/date";
import { formatCurrency } from "../lib/money";
import { moneyAccountLabel } from "../lib/moneyLedger";
import {
  buildSpendingHistory,
  getPreviousSpendingRange,
  getReceivedIncomeTotals,
  getSpendingTotals,
  getSpendingTypeTotals,
  isEntryInRange,
  type SpendingEntry,
  type SpendingMethod,
  type SpendingRange,
  type SpendingTotals,
  type SpendingType,
} from "../lib/spendingHistory";
import { EditExpenseModal } from "./EditExpenseModal";
import { SpendingClassificationModal } from "./SpendingClassificationModal";
import { toggleFilterSelection } from "../lib/filterSelection";
import type { MovementTarget } from "../lib/movementEditing";

interface ReviewViewProps {
  expenses: Expense[];
  data: FinancialData;
  activeCardName?: string;
  onEdit: (expenseId: string, changes: ExpenseEditableFields) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRestore: (expense: Expense) => Promise<void>;
  onClassifyHistorical: (paymentId: string, method: PaymentMethod, moneyAccountId?: string, cardId?: string) => Promise<void>;
  onNotice: (message: string, actionLabel?: string, action?: () => void) => void;
  transferFeeRatePercent: number;
  onOpenMovement?: (target: MovementTarget) => void;
}

type RangeMode = "cycle" | "custom";
type CyclePeriod = "month" | "q1" | "q2";
type Selection = string[] | null;

const TYPE_OPTIONS: Array<{ value: SpendingType; label: string }> = [
  { value: "extra", label: "Extras" },
  { value: "monthly", label: "Facturas mensuales" },
  { value: "nonMonthly", label: "No mensuales" },
  { value: "purchaseGoal", label: "Metas y compras" },
  { value: "savings", label: "Movimientos de ahorro" },
];

const METHOD_OPTIONS: Array<{ value: SpendingMethod; label: string }> = [
  { value: "card", label: "Tarjeta" },
  { value: "bank", label: "Pagado desde banco" },
  { value: "cash", label: "Efectivo" },
  { value: "unclassified", label: "Por clasificar" },
];

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.map((option) => [option.value, option.label])) as Record<SpendingType, string>;
const METHOD_LABELS: Record<SpendingMethod, string> = { card: "Tarjeta", bank: "Banco", cash: "Efectivo", unclassified: "Por clasificar" };
const DETAIL_LABELS: Record<string, string> = {
  cash: "Efectivo",
  debit: "Débito",
  transfer: "Transferencia",
  creditCard: "Tarjeta de crédito",
  bankTransfer: "Transferencia",
  debitCard: "Débito",
};

const toggleSelection = toggleFilterSelection;

const isSelected = (selection: Selection, value: string): boolean => selection === null || selection.includes(value);

function MultiSelectGroup({ title, options, selection, onChange }: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selection: Selection;
  onChange: (selection: Selection) => void;
}) {
  const values = options.map((option) => option.value);
  return <fieldset className="history-filter-group">
    <legend>{title}{selection !== null && ` · ${selection.length} de ${options.length} seleccionadas`}</legend>
    <div className="history-filter-chips">
      <button type="button" className={selection === null ? "active" : ""} onClick={() => onChange(null)}>Todos</button>
      {options.map((option) => <button type="button" aria-pressed={selection?.includes(option.value) || false} className={selection?.includes(option.value) ? "active" : ""} key={option.value} onClick={() => onChange(toggleSelection(selection, option.value, values))}>{selection?.includes(option.value) ? "✓ " : ""}{option.label}</button>)}
    </div>
  </fieldset>;
}

const comparisonText = (current: number, previous: number, currency: Currency): string => {
  const difference = current - previous;
  if (difference === 0) return "Sin cambio frente al período anterior";
  if (previous === 0) return `${formatCurrency(Math.abs(difference), currency)} ${difference > 0 ? "más" : "menos"} · sin base porcentual`;
  const percentage = Math.abs(difference / previous) * 100;
  return `${formatCurrency(Math.abs(difference), currency)} ${difference > 0 ? "más" : "menos"} · ${difference > 0 ? "+" : "−"}${percentage.toFixed(1)}%`;
};

function SummaryCard({ title, current, previous, currency = "DOP", secondaryCurrent, secondaryPrevious }: {
  title: string;
  current: number;
  previous: number;
  currency?: Currency;
  secondaryCurrent?: number;
  secondaryPrevious?: number;
}) {
  return <article className="history-summary-card">
    <span>{title}</span>
    <strong>{formatCurrency(current, currency)}</strong>
    <small>{comparisonText(current, previous, currency)}</small>
    {(secondaryCurrent || secondaryPrevious) ? <small>{formatCurrency(secondaryCurrent || 0, "USD")} · {comparisonText(secondaryCurrent || 0, secondaryPrevious || 0, "USD")}</small> : null}
  </article>;
}

const remainingLabel = (value: number): string => value > 0 ? "Restante" : value < 0 ? "Faltante" : "Balance";
const remainingState = (value: number): "positive" | "negative" | "neutral" => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";

function RemainingCard({ current, previous, secondaryCurrent, secondaryPrevious }: {
  current: number;
  previous: number;
  secondaryCurrent: number;
  secondaryPrevious: number;
}) {
  const state = current === 0 ? remainingState(secondaryCurrent) : remainingState(current);
  return <article className={`history-summary-card history-remaining-card is-${state}`}>
    <span>Restante del ciclo</span>
    <strong className={`remaining-value is-${remainingState(current)}`}>{remainingLabel(current)} {formatCurrency(Math.abs(current), "DOP")}</strong>
    <small>Ingresado − Gastado − Ahorrado</small>
    <small>{comparisonText(current, previous, "DOP")}</small>
    {(secondaryCurrent !== 0 || secondaryPrevious !== 0) && <small className={`remaining-secondary is-${remainingState(secondaryCurrent)}`}>USD: {remainingLabel(secondaryCurrent)} {formatCurrency(Math.abs(secondaryCurrent), "USD")}</small>}
  </article>;
}

const accountKey = (entry: SpendingEntry): string => entry.accountId || "unassigned";

export function ReviewView({ expenses, data, activeCardName, onEdit, onDelete, onRestore, onClassifyHistorical, onNotice, transferFeeRatePercent, onOpenMovement }: ReviewViewProps) {
  const todayKey = toLocalDateKey();
  const currentMonth = getMonthKey(todayKey);
  const currentQuincena = getQuincena(todayKey);
  const currentCycle = getBudgetCycleRange(currentMonth);
  const [rangeMode, setRangeMode] = useState<RangeMode>("cycle");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [cyclePeriod, setCyclePeriod] = useState<CyclePeriod>("month");
  const [customStart, setCustomStart] = useState(currentCycle.startDateKey);
  const [customEnd, setCustomEnd] = useState(currentCycle.endDateKey);
  const [selectedTypes, setSelectedTypes] = useState<Selection>(null);
  const [selectedMethods, setSelectedMethods] = useState<Selection>(null);
  const [selectedCategories, setSelectedCategories] = useState<Selection>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Selection>(null);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [classifying, setClassifying] = useState(false);

  const entries = useMemo(() => buildSpendingHistory(data, expenses), [data, expenses]);
  const currentRange: SpendingRange = useMemo(() => {
    if (rangeMode === "custom") return { startDateKey: customStart, endDateKey: customEnd };
    if (cyclePeriod === "q1") return getQuincenaRange(selectedMonth, 1);
    if (cyclePeriod === "q2") return getQuincenaRange(selectedMonth, 2);
    return getBudgetCycleRange(selectedMonth);
  }, [customEnd, customStart, cyclePeriod, rangeMode, selectedMonth]);
  const previousRange = useMemo(() => getPreviousSpendingRange(currentRange, rangeMode), [currentRange, rangeMode]);
  const availableMonths = useMemo(() => {
    const months = new Set(entries.map((entry) => getMonthKey(entry.date)));
    Object.values(data.incomeOccurrences).filter((income) => income.status === "received").forEach((income) => months.add(income.financialMonth));
    months.add(currentMonth);
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [currentMonth, data.incomeOccurrences, entries]);
  const categoryOptions = useMemo(() => [...new Set(entries.map((entry) => entry.category))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((category) => ({ value: category, label: category })), [entries]);
  const accountOptions = useMemo(() => {
    const ids = new Set(entries.filter((entry) => entry.method === "bank").map(accountKey));
    return [...ids].map((id) => ({ value: id, label: id === "unassigned" ? "Cuenta no registrada" : moneyAccountLabel(id, data) }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [data, entries]);
  const pendingHistoricalCount = useMemo(() => Object.values(data.payments)
    .filter((payment) => payment.historical && !payment.reversedAt && !payment.reportingMethod && payment.historicalSource !== "creditCardOpeningBalance").length, [data.payments]);
  const pendingExpenseCount = useMemo(() => expenses
    .filter((expense) => !expense.deletedAt && !expense.category).length, [expenses]);
  const pendingClassificationCount = pendingHistoricalCount + pendingExpenseCount;

  const applyFilters = (source: SpendingEntry[]): SpendingEntry[] => {
    const query = search.trim().toLocaleLowerCase("es");
    return source.filter((entry) =>
      isSelected(selectedTypes, entry.spendingType)
      && isSelected(selectedMethods, entry.method)
      && isSelected(selectedCategories, entry.category)
      && (entry.method !== "bank" || isSelected(selectedAccounts, accountKey(entry)))
      && (!query || `${entry.name} ${entry.category}`.toLocaleLowerCase("es").includes(query)));
  };

  const periodEntries = useMemo(() => entries.filter((entry) => isEntryInRange(entry, currentRange)
    && (rangeMode === "cycle" || !entry.dateIsApproximate)), [currentRange, entries, rangeMode]);
  const previousPeriodEntries = useMemo(() => entries.filter((entry) => isEntryInRange(entry, previousRange)
    && (rangeMode === "cycle" || !entry.dateIsApproximate)), [entries, previousRange, rangeMode]);
  const filteredCurrent = useMemo(() => applyFilters(periodEntries), [periodEntries, search, selectedAccounts, selectedCategories, selectedMethods, selectedTypes]);
  const sortedCurrent = useMemo(() => [...filteredCurrent].sort((a, b) => {
    if (sort === "oldest") return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    if (sort === "highest") return b.amountMinor - a.amountMinor || b.date.localeCompare(a.date);
    if (sort === "lowest") return a.amountMinor - b.amountMinor || b.date.localeCompare(a.date);
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  }), [filteredCurrent, sort]);
  const currentTotals = useMemo(() => getSpendingTotals(filteredCurrent), [filteredCurrent]);
  const periodTotals = useMemo(() => getSpendingTotals(periodEntries), [periodEntries]);
  const previousPeriodTotals = useMemo(() => getSpendingTotals(previousPeriodEntries), [previousPeriodEntries]);
  const periodTypeTotals = useMemo(() => getSpendingTypeTotals(periodEntries), [periodEntries]);
  const previousTypeTotals = useMemo(() => getSpendingTypeTotals(previousPeriodEntries), [previousPeriodEntries]);
  const periodIncome = useMemo(() => getReceivedIncomeTotals(data, currentRange, rangeMode === "cycle"), [currentRange, data, rangeMode]);
  const previousIncome = useMemo(() => getReceivedIncomeTotals(data, previousRange, rangeMode === "cycle"), [data, previousRange, rangeMode]);
  const periodRemaining = useMemo(() => ({
    DOP: periodIncome.DOP - periodTotals.total.DOP - periodTotals.savings.DOP,
    USD: periodIncome.USD - periodTotals.total.USD - periodTotals.savings.USD,
  }), [periodIncome, periodTotals]);
  const previousRemaining = useMemo(() => ({
    DOP: previousIncome.DOP - previousPeriodTotals.total.DOP - previousPeriodTotals.savings.DOP,
    USD: previousIncome.USD - previousPeriodTotals.total.USD - previousPeriodTotals.savings.USD,
  }), [previousIncome, previousPeriodTotals]);

  const activeFilterCount = [selectedTypes, selectedMethods, selectedCategories, selectedAccounts]
    .filter((selection) => selection !== null).length + (search.trim() ? 1 : 0);
  const resetFilters = () => {
    setSelectedTypes(null);
    setSelectedMethods(null);
    setSelectedCategories(null);
    setSelectedAccounts(null);
    setSearch("");
  };
  const chooseCurrentCycle = () => {
    setRangeMode("cycle");
    setSelectedMonth(currentMonth);
    setCyclePeriod("month");
  };
  const chooseCurrentQuincena = () => {
    setRangeMode("cycle");
    setSelectedMonth(currentMonth);
    setCyclePeriod(currentQuincena === 1 ? "q1" : "q2");
  };
  const updateCustomStart = (value: string) => {
    setCustomStart(value);
    if (value > customEnd) setCustomEnd(value);
  };
  const updateCustomEnd = (value: string) => {
    setCustomEnd(value);
    if (value < customStart) setCustomStart(value);
  };

  const groups = useMemo(() => {
    const grouped = new Map<string, SpendingEntry[]>();
    sortedCurrent.forEach((entry) => {
      const key = `${entry.financialMonth || getMonthKey(entry.date)}:${entry.quincena || getQuincena(entry.date)}`;
      grouped.set(key, [...(grouped.get(key) || []), entry]);
    });
    return [...grouped.entries()];
  }, [sortedCurrent]);

  const categoryRows = useMemo(() => {
    const rows = new Map<string, { category: string; realDop: number; cardDop: number; realUsd: number; cardUsd: number }>();
    filteredCurrent.filter((entry) => entry.nature === "expense").forEach((entry) => {
      const row = rows.get(entry.category) || { category: entry.category, realDop: 0, cardDop: 0, realUsd: 0, cardUsd: 0 };
      const field = entry.currency === "DOP"
        ? entry.method === "card" ? "cardDop" : "realDop"
        : entry.method === "card" ? "cardUsd" : "realUsd";
      row[field] += entry.amountMinor;
      rows.set(entry.category, row);
    });
    return [...rows.values()].sort((a, b) => (b.realDop + b.cardDop) - (a.realDop + a.cardDop) || a.category.localeCompare(b.category, "es"));
  }, [filteredCurrent]);

  const remove = async (expense: Expense) => {
    if (!window.confirm(`¿Eliminar “${expense.name}”? Su efecto financiero también será retirado.`)) return;
    try {
      await onDelete(expense.id);
      onNotice("Gasto eliminado", "Deshacer", () => void onRestore(expense));
    } catch (reason) {
      onNotice(reason instanceof Error ? reason.message : "No se pudo eliminar el gasto.");
    }
  };

  const periodLabel = rangeMode === "custom"
    ? `${formatShortDate(currentRange.startDateKey)} – ${formatShortDate(currentRange.endDateKey)}`
    : cyclePeriod === "month"
      ? `${formatMonthTitle(selectedMonth)} · ${formatBudgetCycleRange(selectedMonth)}`
      : `${formatMonthTitle(selectedMonth)} · Quincena ${cyclePeriod === "q1" ? 1 : 2} · ${formatQuincenaRange(selectedMonth, cyclePeriod === "q1" ? 1 : 2)}`;

  const paymentDescription = (entry: SpendingEntry): string => {
    if (entry.method === "unclassified") return "Método pendiente de clasificar";
    if (entry.method === "card") return `${METHOD_LABELS.card} · ${entry.cardId ? data.creditCards[entry.cardId]?.name || activeCardName || "Tarjeta registrada" : activeCardName || "Tarjeta registrada"}`;
    if (entry.method === "cash") return "Efectivo";
    const detail = entry.detailedMethod ? DETAIL_LABELS[entry.detailedMethod] : "Banco";
    return `${detail} · ${entry.accountId ? moneyAccountLabel(entry.accountId, data) : "Cuenta no registrada"}`;
  };

  const currencyCaption = (values: Record<Currency, number>): string => `${formatCurrency(values.DOP, "DOP")}${values.USD > 0 ? ` · ${formatCurrency(values.USD, "USD")}` : ""}`;
  const totalCaption = (totals: SpendingTotals): string => {
    const parts = [`Gastado ${currencyCaption(totals.total)}`];
    if (totals.savings.DOP > 0 || totals.savings.USD > 0) parts.push(`Ahorrado ${currencyCaption(totals.savings)}`);
    return parts.join(" · ");
  };

  return <section className="review-view spending-history" aria-labelledby="review-title">
    <div className="review-heading"><div><span className="eyebrow">Gastos realizados sin duplicados</span><h1 id="review-title">Historial de gastos</h1></div></div>

    <div className="review-filter-shortcuts"><button type="button" onClick={chooseCurrentCycle}>Ciclo actual</button><button type="button" onClick={chooseCurrentQuincena}>Quincena actual</button></div>

    <section className="history-range-panel" aria-label="Período del historial">
      <div className="history-range-tabs"><button type="button" className={rangeMode === "cycle" ? "active" : ""} onClick={() => setRangeMode("cycle")}>Ciclo financiero</button><button type="button" className={rangeMode === "custom" ? "active" : ""} onClick={() => setRangeMode("custom")}>Rango de fechas</button></div>
      {rangeMode === "cycle" ? <div className="review-filter"><label><span>Mes financiero</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{availableMonths.map((monthKey) => <option key={monthKey} value={monthKey}>{formatMonthTitle(monthKey)} · {formatBudgetCycleRange(monthKey)}</option>)}</select></label><label><span>Período</span><select value={cyclePeriod} onChange={(event) => setCyclePeriod(event.target.value as CyclePeriod)}><option value="month">Mes completo</option><option value="q1">Quincena 1</option><option value="q2">Quincena 2</option></select></label></div> : <><div className="review-filter"><label><span>Desde</span><input type="date" value={customStart} onChange={(event) => updateCustomStart(event.target.value)} /></label><label><span>Hasta</span><input type="date" value={customEnd} onChange={(event) => updateCustomEnd(event.target.value)} /></label></div><p className="privacy-note">Los pagos históricos sin fecha exacta solo aparecen al consultar su ciclo o quincena original.</p></>}
    </section>

    {pendingClassificationCount > 0 && <section className="history-classification-banner"><div><strong>{pendingClassificationCount} registro{pendingClassificationCount === 1 ? "" : "s"} pendiente{pendingClassificationCount === 1 ? "" : "s"} de clasificar</strong><span>{pendingHistoricalCount} pago{pendingHistoricalCount === 1 ? "" : "s"} histórico{pendingHistoricalCount === 1 ? "" : "s"} y {pendingExpenseCount} gasto{pendingExpenseCount === 1 ? "" : "s"} extra{pendingExpenseCount === 1 ? "" : "s"}. Los totales se conservan, pero la distribución por método estará incompleta.</span></div><button type="button" className="button button-primary" onClick={() => setClassifying(true)}>Completar clasificación</button></section>}

    <section className="history-overview-shell" aria-labelledby="cycle-summary-title">
      <div className="history-section-heading"><span className="eyebrow">Resultado del período</span><h2 id="cycle-summary-title">Resumen del ciclo</h2></div>
      <div className="history-summary history-primary-summary">
        <SummaryCard title="Total ingresado" current={periodIncome.DOP} previous={previousIncome.DOP} secondaryCurrent={periodIncome.USD} secondaryPrevious={previousIncome.USD} />
        <SummaryCard title="Total gastado" current={periodTotals.total.DOP} previous={previousPeriodTotals.total.DOP} secondaryCurrent={periodTotals.total.USD} secondaryPrevious={previousPeriodTotals.total.USD} />
        <SummaryCard title="Total ahorrado" current={periodTotals.savings.DOP} previous={previousPeriodTotals.savings.DOP} secondaryCurrent={periodTotals.savings.USD} secondaryPrevious={previousPeriodTotals.savings.USD} />
        <RemainingCard current={periodRemaining.DOP} previous={previousRemaining.DOP} secondaryCurrent={periodRemaining.USD} secondaryPrevious={previousRemaining.USD} />
      </div>
      <p className="history-comparison-caption">Comparado con {formatShortDate(previousRange.startDateKey)} – {formatShortDate(previousRange.endDateKey)}. Los filtros de detalle no cambian este resumen.</p>
    </section>

    <section className="history-breakdown-shell" aria-labelledby="spending-breakdown-title">
      <div className="history-section-heading"><span className="eyebrow">De dónde salió el gasto</span><h2 id="spending-breakdown-title">Desglose de gastos</h2></div>
      <div className="history-summary history-detail-summary">
        <SummaryCard title="Presupuesto" current={periodTypeTotals.monthly.DOP} previous={previousTypeTotals.monthly.DOP} secondaryCurrent={periodTypeTotals.monthly.USD} secondaryPrevious={previousTypeTotals.monthly.USD} />
        <SummaryCard title="Extras" current={periodTypeTotals.extra.DOP} previous={previousTypeTotals.extra.DOP} secondaryCurrent={periodTypeTotals.extra.USD} secondaryPrevious={previousTypeTotals.extra.USD} />
        <SummaryCard title="No mensuales" current={periodTypeTotals.nonMonthly.DOP} previous={previousTypeTotals.nonMonthly.DOP} secondaryCurrent={periodTypeTotals.nonMonthly.USD} secondaryPrevious={previousTypeTotals.nonMonthly.USD} />
        <SummaryCard title="Metas de compra" current={periodTypeTotals.purchaseGoal.DOP} previous={previousTypeTotals.purchaseGoal.DOP} secondaryCurrent={periodTypeTotals.purchaseGoal.USD} secondaryPrevious={previousTypeTotals.purchaseGoal.USD} />
      </div>
      <div className="history-section-divider" />
      <div className="history-section-heading compact"><span className="eyebrow">Medio utilizado</span><h2>Cómo se pagó</h2></div>
      <div className="history-summary history-detail-summary">
        <div><SummaryCard title="Pagado desde banco" current={periodTotals.bank.DOP} previous={previousPeriodTotals.bank.DOP} secondaryCurrent={periodTotals.bank.USD} secondaryPrevious={previousPeriodTotals.bank.USD} /><small>Débito y transferencias</small></div>
        <SummaryCard title="Efectivo" current={periodTotals.cash.DOP} previous={previousPeriodTotals.cash.DOP} secondaryCurrent={periodTotals.cash.USD} secondaryPrevious={previousPeriodTotals.cash.USD} />
        <SummaryCard title="Tarjeta DOP" current={periodTotals.card.DOP} previous={previousPeriodTotals.card.DOP} />
        {(periodTotals.card.USD > 0 || previousPeriodTotals.card.USD > 0) && <SummaryCard title="Tarjeta USD" current={periodTotals.card.USD} previous={previousPeriodTotals.card.USD} currency="USD" />}
        {(periodTotals.unclassified.DOP > 0 || previousPeriodTotals.unclassified.DOP > 0 || periodTotals.unclassified.USD > 0 || previousPeriodTotals.unclassified.USD > 0) && <SummaryCard title="Por clasificar" current={periodTotals.unclassified.DOP} previous={previousPeriodTotals.unclassified.DOP} secondaryCurrent={periodTotals.unclassified.USD} secondaryPrevious={previousPeriodTotals.unclassified.USD} />}
      </div>
    </section>

    <section className="history-filter-shell">
      <div className="history-filter-heading"><div><span>Filtros</span><small>{activeFilterCount ? `${activeFilterCount} grupo${activeFilterCount === 1 ? "" : "s"} modificado${activeFilterCount === 1 ? "" : "s"}` : "Mostrando todas las opciones"}</small></div><div><button type="button" className="button button-secondary" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? "Ocultar filtros" : "Filtrar"}{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>{activeFilterCount > 0 && <button type="button" className="button button-quiet" onClick={resetFilters}>Limpiar</button>}</div></div>
      {filtersOpen && <div className="history-filter-body">
        <label className="field"><span>Buscar por nombre o categoría</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. medicamentos o salud" /></label>
        <MultiSelectGroup title="Tipo" options={TYPE_OPTIONS} selection={selectedTypes} onChange={setSelectedTypes} />
        <MultiSelectGroup title="Forma de pago" options={METHOD_OPTIONS} selection={selectedMethods} onChange={setSelectedMethods} />
        {accountOptions.length > 0 && isSelected(selectedMethods, "bank") && <MultiSelectGroup title="Cuenta bancaria" options={accountOptions} selection={selectedAccounts} onChange={setSelectedAccounts} />}
        {categoryOptions.length > 0 && <MultiSelectGroup title="Categoría" options={categoryOptions} selection={selectedCategories} onChange={setSelectedCategories} />}
      </div>}
    </section>

    <section className="review-total-sticky" aria-label="Resultados filtrados del período"><div><span>Resultados filtrados</span><small>{periodLabel} · mostrando {filteredCurrent.length} de {periodEntries.length} registros</small></div><div className="history-total-values"><strong>Gastado {formatCurrency(currentTotals.total.DOP, "DOP")}</strong>{currentTotals.savings.DOP > 0 && <strong>Ahorrado {formatCurrency(currentTotals.savings.DOP, "DOP")}</strong>}{currentTotals.total.USD > 0 && <strong>Gastado {formatCurrency(currentTotals.total.USD, "USD")}</strong>}{currentTotals.savings.USD > 0 && <strong>Ahorrado {formatCurrency(currentTotals.savings.USD, "USD")}</strong>}</div></section>
    {activeFilterCount > 0 && <p className="history-period-total">Total del período sin filtros: {totalCaption(periodTotals)}</p>}

    <section className="history-category-section">
      <div className="section-title-row"><div><span className="eyebrow">Distribución filtrada</span><h2>Resumen por categoría</h2></div></div>
      {!categoryRows.length ? <p className="muted-panel">No hay categorías para la selección actual.</p> : <div className="table-scroll"><table className="history-category-table"><thead><tr><th>Categoría</th><th>Dinero real DOP</th><th>Tarjeta DOP</th><th>Dinero real USD</th><th>Tarjeta USD</th><th>Total DOP</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={row.category}><td>{row.category}</td><td>{formatCurrency(row.realDop, "DOP")}</td><td>{formatCurrency(row.cardDop, "DOP")}</td><td>{formatCurrency(row.realUsd, "USD")}</td><td>{formatCurrency(row.cardUsd, "USD")}</td><td>{formatCurrency(row.realDop + row.cardDop, "DOP")}</td></tr>)}</tbody></table></div>}
    </section>

    <div className="history-list-heading"><div><span className="eyebrow">Detalle</span><h2>Movimientos incluidos</h2></div><label className="field compact-field"><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="highest">Mayor importe</option><option value="lowest">Menor importe</option></select></label></div>

    {!groups.length ? <div className="empty-state"><div className="empty-icon" aria-hidden="true">$</div><h2>No hay movimientos para esta selección</h2><p>Cambia el período o los filtros para consultar otros registros.</p></div> : <div className="month-groups">{groups.map(([key, batch]) => {
      const [monthKey, quincenaRaw] = key.split(":");
      const quincena = Number(quincenaRaw) as Quincena;
      const batchTotals = getSpendingTotals(batch);
      return <section className="quincena-group" key={key}><div className="quincena-header"><div><h3>{formatMonthTitle(monthKey)} · Quincena {quincena}</h3><span>{formatQuincenaRange(monthKey, quincena)} · {batch.length} registro{batch.length === 1 ? "" : "s"} · {totalCaption(batchTotals)}</span></div></div><div className="expense-list">{batch.map((entry) => {
        const editableExpense = entry.source === "expense" ? expenses.find((expense) => expense.id === entry.sourceId) : undefined;
        return <article className="expense-card" key={entry.id}><div className="expense-main"><div className="expense-title-row"><h4>{entry.name}</h4><strong>{formatCurrency(entry.amountMinor, entry.currency)}</strong></div><div className="expense-meta"><span>{entry.dateIsApproximate ? "Fecha exacta no registrada" : formatShortDate(entry.date)}</span><span className="history-entry-type">{TYPE_LABELS[entry.spendingType]}</span>{entry.nature === "savings" && <span className="history-entry-nature nature-savings">Ahorrado</span>}<span>{entry.category}</span><span>{paymentDescription(entry)}</span>{entry.originalCurrency && entry.originalAmountMinor && <span>Importe original: {formatCurrency(entry.originalAmountMinor, entry.originalCurrency)}</span>}{Object.values(data.balanceIssues).some(i=>i.status==="pending" && i.movementPaths.some(p=>p.endsWith(`/${entry.sourceId}`) || (entry.source==="expense" && p.startsWith("moneyTransactions/") && data.moneyTransactions[p.split("/")[1]]?.linkedDailyExpenseId===entry.sourceId))) && <span className="form-error">Incidencia pendiente</span>}</div></div>{editableExpense ? <div className="expense-actions history-expense-actions"><button type="button" onClick={() => setEditing(editableExpense)}>Editar</button><button type="button" className="action-danger" onClick={() => void remove(editableExpense)}>Eliminar</button></div> : entry.source !== "expense" && onOpenMovement && <div className="expense-actions"><button type="button" onClick={()=>onOpenMovement({source:entry.source as MovementTarget["source"],sourceId:entry.sourceId})}>Ver y corregir en origen</button></div>}</article>;
      })}</div></section>;
    })}</div>}

    {editing && <EditExpenseModal expense={editing} data={data} activeCardName={activeCardName} transferFeeRatePercent={transferFeeRatePercent} onClose={() => setEditing(null)} onSave={onEdit} />}
    {classifying && <SpendingClassificationModal data={data} expenses={expenses} onClassifyHistorical={onClassifyHistorical} onEditExpense={onEdit} onClose={() => setClassifying(false)} />}
  </section>;
}
