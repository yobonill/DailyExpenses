import { useMemo, useState } from "react";
import type { Expense } from "../models/expense";
import {
  formatBudgetCycleRange,
  formatMonthTitle,
  formatQuincenaRange,
  getMonthKey,
  getQuincena,
  toLocalDateKey,
  type Quincena,
} from "../lib/date";
import { getExpenseTotalCents } from "../lib/excel";
import { formatMoney } from "../lib/money";

type ReportPeriod = "month" | "q1" | "q2";

interface ReportViewProps {
  expenses: Expense[];
}

const getCurrentMonthKey = (): string => getMonthKey(toLocalDateKey());

const sumExpenses = (expenses: Expense[]): number =>
  expenses.reduce((total, expense) => total + getExpenseTotalCents(expense), 0);

const getPeriodQuincena = (period: ReportPeriod): Quincena | null => {
  if (period === "q1") return 1;
  if (period === "q2") return 2;
  return null;
};

export function ReportView({ expenses }: ReportViewProps) {
  const currentMonth = getCurrentMonthKey();
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([currentMonth]);

  const availableMonths = useMemo(() => {
    const months = new Set(expenses.map((expense) => getMonthKey(expense.occurredDate)));
    months.add(currentMonth);
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [expenses, currentMonth]);

  const selectedSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);
  const selectedQuincena = getPeriodQuincena(period);

  const reportExpenses = useMemo(
    () =>
      expenses.filter((expense) => {
        if (!selectedSet.has(getMonthKey(expense.occurredDate))) return false;
        return selectedQuincena === null || getQuincena(expense.occurredDate) === selectedQuincena;
      }),
    [expenses, selectedSet, selectedQuincena],
  );

  const totalCents = useMemo(() => sumExpenses(reportExpenses), [reportExpenses]);
  const pendingCents = useMemo(
    () => sumExpenses(reportExpenses.filter((expense) => expense.status === "pending")),
    [reportExpenses],
  );
  const transferredCents = totalCents - pendingCents;

  const monthBreakdown = useMemo(
    () =>
      selectedMonths
        .slice()
        .sort((a, b) => b.localeCompare(a))
        .map((monthKey) => {
          const monthExpenses = expenses.filter(
            (expense) => getMonthKey(expense.occurredDate) === monthKey,
          );
          const q1 = monthExpenses.filter((expense) => getQuincena(expense.occurredDate) === 1);
          const q2 = monthExpenses.filter((expense) => getQuincena(expense.occurredDate) === 2);
          const visible = selectedQuincena === 1 ? q1 : selectedQuincena === 2 ? q2 : monthExpenses;

          return {
            monthKey,
            totalCents: sumExpenses(visible),
            count: visible.length,
            q1Cents: sumExpenses(q1),
            q2Cents: sumExpenses(q2),
          };
        }),
    [expenses, selectedMonths, selectedQuincena],
  );

  const toggleMonth = (monthKey: string) => {
    setSelectedMonths((current) => {
      if (current.includes(monthKey)) {
        if (current.length === 1) return current;
        return current.filter((key) => key !== monthKey);
      }
      return [...current, monthKey];
    });
  };

  const selectCurrentMonth = () => setSelectedMonths([currentMonth]);

  return (
    <section className="report-view" aria-labelledby="report-title">
      <div className="report-heading">
        <div>
          <span className="eyebrow">Resumen de gastos</span>
          <h1 id="report-title">Reportes</h1>
        </div>
      </div>

      <section className="report-filters" aria-label="Filtros del reporte">
        <div className="filter-block">
          <div className="filter-label-row">
            <span className="filter-label">Período</span>
            <button className="text-button" type="button" onClick={selectCurrentMonth}>
              Mes actual
            </button>
          </div>
          <div className="period-segments">
            <button type="button" className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mes completo</button>
            <button type="button" className={period === "q1" ? "active" : ""} onClick={() => setPeriod("q1")}>Quincena 1</button>
            <button type="button" className={period === "q2" ? "active" : ""} onClick={() => setPeriod("q2")}>Quincena 2</button>
          </div>
        </div>

        <div className="filter-block">
          <span className="filter-label">Meses</span>
          <div className="month-selector" role="group" aria-label="Seleccionar meses para el reporte">
            {availableMonths.map((monthKey) => (
              <button
                key={monthKey}
                type="button"
                className={selectedSet.has(monthKey) ? "selected" : ""}
                aria-pressed={selectedSet.has(monthKey)}
                onClick={() => toggleMonth(monthKey)}
              >
                {formatMonthTitle(monthKey)} · {formatBudgetCycleRange(monthKey)}
              </button>
            ))}
          </div>
          <p className="filter-help">Puedes seleccionar uno o varios meses. Siempre debe quedar al menos uno seleccionado.</p>
        </div>
      </section>

      <section className="report-total-card" aria-label="Total del reporte">
        <span>Total gastado</span>
        <strong>{formatMoney(totalCents)}</strong>
        <small>{reportExpenses.length} gasto{reportExpenses.length === 1 ? "" : "s"} en el período seleccionado</small>
      </section>

      <div className="report-status-grid">
        <article>
          <span>Pendiente de registrar</span>
          <strong>{formatMoney(pendingCents)}</strong>
        </article>
        <article>
          <span>Registrado en Excel</span>
          <strong>{formatMoney(transferredCents)}</strong>
        </article>
      </div>

      <section className="report-breakdown" aria-labelledby="report-breakdown-title">
        <h2 id="report-breakdown-title">Desglose</h2>
        {!monthBreakdown.length ? (
          <div className="empty-state compact-empty">
            <p>No hay gastos para el período seleccionado.</p>
          </div>
        ) : (
          <div className="report-month-list">
            {monthBreakdown.map((month) => (
              <article className="report-month-card" key={month.monthKey}>
                <div className="report-month-main">
                  <div>
                    <h3>{formatMonthTitle(month.monthKey)}</h3>
                    <span>{formatBudgetCycleRange(month.monthKey)} · {month.count} gasto{month.count === 1 ? "" : "s"}</span>
                  </div>
                  <strong>{formatMoney(month.totalCents)}</strong>
                </div>
                {period === "month" && (
                  <div className="report-quincena-row">
                    <span>Quincena 1 · {formatQuincenaRange(month.monthKey, 1)} <strong>{formatMoney(month.q1Cents)}</strong></span>
                    <span>Quincena 2 · {formatQuincenaRange(month.monthKey, 2)} <strong>{formatMoney(month.q2Cents)}</strong></span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
