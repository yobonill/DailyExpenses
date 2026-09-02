import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES } from "../../config/financeCategories";
import type { Expense } from "../../models/expense";
import type { Currency, FinancialData } from "../../models/finance";
import { formatMonthTitle, getMonthKey, getQuincena, toLocalDateKey } from "../../lib/date";
import {
  calculateCardPaymentProjection,
  calculateReportTotals,
  isInSelectedPeriod,
  isPlannedOccurrenceInSelectedPeriod,
} from "../../lib/financialCalculations";
import { formatCurrency } from "../../lib/money";
import { PageHeading } from "./Shared";

type ReportMode = "spending" | "cashFlow" | "planning";

interface CategoryBreakdownRow {
  category: string;
  currency: Currency;
  expected: number;
  paid: number;
  pending: number;
}

export function FinanceReportView({ data, expenses }: { data: FinancialData; expenses: Expense[] }) {
  const currentMonth = getMonthKey(toLocalDateKey());
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)));
  const [selectedMonths, setSelectedMonths] = useState<string[]>([currentMonth]);
  const [quincena, setQuincena] = useState<"all" | 1 | 2>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mode, setMode] = useState<ReportMode>("spending");
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`),
    [year],
  );
  const selected = selectedMonths.filter((month) => month.startsWith(`${year}-`));
  const effectiveMonths = selected.length ? selected : [monthOptions[0]];
  const dop = calculateReportTotals(data, expenses, effectiveMonths, quincena, "DOP");
  const usd = calculateReportTotals(data, expenses, effectiveMonths, quincena, "USD");
  const cardProjection = calculateCardPaymentProjection(
    data,
    effectiveMonths,
    quincena,
    data.settings.estimatedUsdToDopRate,
  );

  const toggleMonth = (month: string) => setSelectedMonths((current) =>
    current.includes(month)
      ? (current.length === 1 ? current : current.filter((item) => item !== month))
      : [...current.filter((item) => item.startsWith(`${year}-`)), month]);
  const chooseYear = (nextYear: number) => {
    setYear(nextYear);
    setSelectedMonths([`${nextYear}-${currentMonth.slice(5)}`]);
  };
  const modeValue = (currency: Currency) => {
    const totals = currency === "DOP" ? dop : usd;
    if (mode === "spending") return totals.spending;
    if (mode === "cashFlow") return totals.cashFlow;
    return totals.planning - (currency === "DOP" ? cardProjection.totalCashCommitmentDopMinor : 0);
  };

  const categoryOptions = useMemo(() => {
    const present = new Set([
      ...Object.values(data.monthlyOccurrences).map((item) => item.category).filter(Boolean),
      ...Object.values(data.nonMonthlyOccurrences).map((item) => item.category).filter(Boolean),
      ...expenses.map((item) => item.category).filter(Boolean),
    ] as string[]);
    return [
      ...EXPENSE_CATEGORIES,
      ...[...present].filter((item) => !EXPENSE_CATEGORIES.some((category) => category === item)).sort(),
    ];
  }, [data.monthlyOccurrences, data.nonMonthlyOccurrences, expenses]);

  const categoryRows = useMemo(() => {
    const selectedPeriod = new Set(effectiveMonths);
    const rows = new Map<string, CategoryBreakdownRow>();
    const readRow = (category: string, currency: Currency) => {
      const key = `${category}:${currency}`;
      const row = rows.get(key) || { category, currency, expected: 0, paid: 0, pending: 0 };
      rows.set(key, row);
      return row;
    };
    const addObligation = (item: {
      category?: string;
      currency: Currency;
      expectedAmountMinor: number;
      actualAmountMinor?: number;
      status: string;
    }) => {
      const category = item.category || "Sin categoría";
      if (categoryFilter !== "all" && category !== categoryFilter) return;
      const row = readRow(category, item.currency);
      row.expected += item.expectedAmountMinor;
      if (item.status === "paid") row.paid += item.actualAmountMinor ?? item.expectedAmountMinor;
      else row.pending += item.expectedAmountMinor;
    };
    Object.values(data.monthlyOccurrences)
      .filter((item) => item.status !== "cancelled" && isPlannedOccurrenceInSelectedPeriod(item, selectedPeriod, quincena))
      .forEach(addObligation);
    Object.values(data.nonMonthlyOccurrences)
      .filter((item) => item.status !== "cancelled" && isInSelectedPeriod(item.dueDate, selectedPeriod, quincena))
      .forEach(addObligation);
    expenses
      .filter((item) => !item.deletedAt && isInSelectedPeriod(item.occurredDate, selectedPeriod, quincena))
      .forEach((item) => {
        const category = item.category || "Sin categoría";
        if (categoryFilter !== "all" && category !== categoryFilter) return;
        const currency: Currency = item.currency === "USD" ? "USD" : "DOP";
        const amount = item.unitPriceCents * item.quantity;
        const row = readRow(category, currency);
        row.expected += amount;
        row.paid += amount;
      });
    const order = new Map<string, number>(
      ["Sin categoría", ...EXPENSE_CATEGORIES].map((category, index) => [category, index]),
    );
    return [...rows.values()].sort((a, b) =>
      (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999)
      || a.category.localeCompare(b.category)
      || a.currency.localeCompare(b.currency));
  }, [categoryFilter, data.monthlyOccurrences, data.nonMonthlyOccurrences, effectiveMonths, expenses, quincena]);

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Análisis" title="Reportes" />
      <section className="report-filters">
        <div className="form-columns">
          <label className="field"><span>Año</span><input type="number" min="2020" max="2100" value={year} onChange={(event) => chooseYear(Number(event.target.value) || year)} /></label>
          <label className="field"><span>Quincena</span><select value={quincena} onChange={(event) => setQuincena(event.target.value === "all" ? "all" : Number(event.target.value) as 1 | 2)}><option value="all">Mes completo</option><option value="1">Quincena 1</option><option value="2">Quincena 2</option></select></label>
        </div>
        <div className="month-selector">{monthOptions.map((month) => <button type="button" key={month} className={effectiveMonths.includes(month) ? "selected" : ""} onClick={() => toggleMonth(month)}>{formatMonthTitle(month).replace(` ${year}`, "")}</button>)}</div>
        <div className="report-shortcuts"><button type="button" onClick={() => setSelectedMonths([currentMonth])}>Mes actual</button><button type="button" onClick={() => setSelectedMonths(monthOptions)}>Todo el año</button></div>
      </section>

      <div className="mode-tabs"><button type="button" className={mode === "spending" ? "active" : ""} onClick={() => setMode("spending")}>Gastos</button><button type="button" className={mode === "cashFlow" ? "active" : ""} onClick={() => setMode("cashFlow")}>Flujo de caja</button><button type="button" className={mode === "planning" ? "active" : ""} onClick={() => setMode("planning")}>Planificación</button></div>
      <div className="projection-grid">
        <article className={`projection-card ${modeValue("DOP") < 0 ? "negative" : ""}`}><span>{mode === "spending" ? "Gasto DOP" : mode === "cashFlow" ? "Flujo DOP" : "Proyección DOP"}</span><strong>{formatCurrency(modeValue("DOP"), "DOP")}</strong><small>{effectiveMonths.length} mes(es) seleccionado(s)</small></article>
        <article className={`projection-card ${modeValue("USD") < 0 ? "negative" : ""}`}><span>{mode === "spending" ? "Gasto USD" : mode === "cashFlow" ? "Flujo USD" : "Proyección USD"}</span><strong>{formatCurrency(modeValue("USD"), "USD")}</strong><small>Sin combinar monedas</small></article>
      </div>

      <div className="report-detail-grid">
        <article><h2>Ingresos</h2><dl><div><dt>Esperados DOP</dt><dd>{formatCurrency(dop.expectedIncome, "DOP")}</dd></div><div><dt>Recibidos DOP</dt><dd>{formatCurrency(dop.receivedIncome, "DOP")}</dd></div><div><dt>Recibidos USD</dt><dd>{formatCurrency(usd.receivedIncome, "USD")}</dd></div></dl></article>
        <article><h2>Gastos realizados</h2><dl><div><dt>Extras DOP</dt><dd>{formatCurrency(dop.dailySpending, "DOP")}</dd></div><div><dt>Extras USD</dt><dd>{formatCurrency(usd.dailySpending, "USD")}</dd></div><div><dt>Mensuales pagados</dt><dd>{formatCurrency(dop.monthlyPaid, "DOP")}</dd></div><div><dt>No mensuales pagados</dt><dd>{formatCurrency(dop.nonMonthlyPaid, "DOP")}</dd></div></dl></article>
        <article><h2>Obligaciones</h2><dl><div><dt>Mensuales pendientes</dt><dd>{formatCurrency(dop.monthlyPending, "DOP")}</dd></div><div><dt>No mensuales pendientes</dt><dd>{formatCurrency(dop.nonMonthlyPending, "DOP")}</dd></div><div><dt>Deuda tarjeta DOP</dt><dd>{formatCurrency(dop.endingCardDebt, "DOP")}</dd></div><div><dt>Deuda tarjeta USD</dt><dd>{formatCurrency(usd.endingCardDebt, "USD")}</dd></div></dl></article>
        <article><h2>Movimientos de efectivo</h2><dl><div><dt>Extras pagados sin crédito</dt><dd>{formatCurrency(dop.dailyCashSpending, "DOP")}</dd></div><div><dt>Salida real por pagos de tarjeta</dt><dd>{formatCurrency(dop.cardPayments, "DOP")}</dd></div><div><dt>Pago de tarjeta registrado o previsto</dt><dd>{formatCurrency(cardProjection.totalCashCommitmentDopMinor, "DOP")}</dd></div><div><dt>Depósitos a ahorros</dt><dd>{formatCurrency(dop.savingsDeposits, "DOP")}</dd></div></dl></article>
      </div>

      <section className="management-section">
        <div className="section-title-row"><div><span className="eyebrow">Gastos extras</span><h2>Cómo fueron pagados</h2></div></div>
        <div className="metric-grid"><article><span>Total DOP</span><strong>{formatCurrency(dop.dailySpending, "DOP")}</strong><small>Todos los gastos extras</small></article><article><span>Pago inmediato</span><strong>{formatCurrency(dop.dailyCashSpending, "DOP")}</strong><small>Efectivo, débito o transferencia</small></article><article><span>Cargado a tarjeta DOP</span><strong>{formatCurrency(dop.dailyCardSpending, "DOP")}</strong><small>No se descuenta otra vez hasta pagar la tarjeta</small></article><article><span>Cargado a tarjeta USD</span><strong>{formatCurrency(usd.dailyCardSpending, "USD")}</strong><small>Deuda conservada en USD</small></article></div>
      </section>

      <section className="management-section">
        <div className="section-title-row category-report-heading"><div><span className="eyebrow">Todos los gastos</span><h2>Resumen por categoría</h2></div><label className="field compact-field"><span>Mostrar</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas las categorías</option><option value="Sin categoría">Sin categoría</option>{categoryOptions.map((category) => <option value={category} key={category}>{category}</option>)}</select></label></div>
        {!categoryRows.length ? <p className="muted-panel">No hay gastos en esta categoría y período.</p> : <div className="table-scroll"><table><thead><tr><th>Categoría</th><th>Moneda</th><th>Total</th><th>Realizado</th><th>Pendiente</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={`${row.category}-${row.currency}`}><td>{row.category}</td><td>{row.currency}</td><td>{formatCurrency(row.expected, row.currency)}</td><td>{formatCurrency(row.paid, row.currency)}</td><td>{formatCurrency(row.pending, row.currency)}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
  );
}
