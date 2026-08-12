import { useMemo, useState } from "react";
import type { Expense, ExpenseStatus } from "../models/expense";
import { formatMonthTitle, formatShortDate, getMonthKey, getQuincena, toLocalDateKey, type Quincena } from "../lib/date";
import { expenseToExcelRow, expensesToExcelRows, getExpenseTotalCents } from "../lib/excel";
import { formatMoney } from "../lib/money";
import { EditExpenseModal } from "./EditExpenseModal";

interface ReviewViewProps {
  expenses: Expense[];
  onEdit: (
    expenseId: string,
    changes: Pick<Expense, "name" | "unitPriceCents" | "quantity" | "occurredDate">,
  ) => Promise<void>;
  onTransfer: (ids: string[]) => Promise<void>;
  onPending: (ids: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onNotice: (message: string, actionLabel?: string, action?: () => void) => void;
}

interface ExpenseGroup {
  monthKey: string;
  quincenas: Map<Quincena, Expense[]>;
}

type ReviewPeriod = "month" | "q1" | "q2" | "all";

const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

const groupExpenses = (expenses: Expense[]): ExpenseGroup[] => {
  const months = new Map<string, Map<Quincena, Expense[]>>();
  const sorted = [...expenses].sort((a, b) => {
    const dateCompare = a.occurredDate.localeCompare(b.occurredDate);
    return dateCompare || a.createdAt.localeCompare(b.createdAt);
  });

  for (const expense of sorted) {
    const monthKey = getMonthKey(expense.occurredDate);
    const quincena = getQuincena(expense.occurredDate);
    if (!months.has(monthKey)) months.set(monthKey, new Map());
    const month = months.get(monthKey)!;
    if (!month.has(quincena)) month.set(quincena, []);
    month.get(quincena)!.push(expense);
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, quincenas]) => ({ monthKey, quincenas }));
};

const sumExpenses = (expenses: Expense[]): number =>
  expenses.reduce((total, expense) => total + getExpenseTotalCents(expense), 0);

export function ReviewView({
  expenses,
  onEdit,
  onTransfer,
  onPending,
  onDelete,
  onRestore,
  onNotice,
}: ReviewViewProps) {
  const todayKey = toLocalDateKey();
  const currentMonth = getMonthKey(todayKey);
  const currentQuincena = getQuincena(todayKey);
  const [status, setStatus] = useState<ExpenseStatus>("pending");
  const [period, setPeriod] = useState<ReviewPeriod>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Expense | null>(null);

  const availableMonths = useMemo(() => {
    const months = new Set(expenses.map((expense) => getMonthKey(expense.occurredDate)));
    months.add(currentMonth);
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [expenses, currentMonth]);

  const statusExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === status),
    [expenses, status],
  );

  const filtered = useMemo(
    () =>
      statusExpenses.filter((expense) => {
        if (period === "all") return true;
        if (getMonthKey(expense.occurredDate) !== selectedMonth) return false;
        if (period === "q1") return getQuincena(expense.occurredDate) === 1;
        if (period === "q2") return getQuincena(expense.occurredDate) === 2;
        return true;
      }),
    [period, selectedMonth, statusExpenses],
  );

  const groups = useMemo(() => groupExpenses(filtered), [filtered]);
  const pendingTotal = expenses.filter((expense) => expense.status === "pending").length;
  const visibleTotalCents = useMemo(() => sumExpenses(filtered), [filtered]);

  const periodLabel = useMemo(() => {
    if (period === "all") return "Todos los meses";
    const month = formatMonthTitle(selectedMonth);
    if (period === "q1") return `${month} · Quincena 1`;
    if (period === "q2") return `${month} · Quincena 2`;
    return month;
  }, [period, selectedMonth]);

  const copyOne = async (expense: Expense) => {
    try {
      await copyText(expenseToExcelRow(expense));
      onNotice("Copiado para Excel");
    } catch {
      onNotice("No se pudo copiar al portapapeles.");
    }
  };

  const copyBatch = async (batch: Expense[]) => {
    try {
      await copyText(expensesToExcelRows(batch));
      onNotice(`${batch.length} gasto${batch.length === 1 ? "" : "s"} copiado${batch.length === 1 ? "" : "s"}`);
    } catch {
      onNotice("No se pudo copiar al portapapeles.");
    }
  };

  const transferBatch = async (batch: Expense[]) => {
    if (!batch.length) return;
    const label = batch.length === 1 ? "este gasto" : `estos ${batch.length} gastos`;
    if (!window.confirm(`¿Marcar ${label} como registrados en Excel?`)) return;
    const ids = batch.map((expense) => expense.id);
    await onTransfer(ids);
    onNotice(
      `${batch.length} gasto${batch.length === 1 ? "" : "s"} marcado${batch.length === 1 ? "" : "s"} como registrado${batch.length === 1 ? "" : "s"}`,
      "Deshacer",
      () => void onPending(ids),
    );
  };

  const transfer = async (expense: Expense) => {
    await onTransfer([expense.id]);
    onNotice("Marcado como registrado en Excel", "Deshacer", () => {
      void onPending([expense.id]);
    });
  };

  const returnToPending = async (expense: Expense) => {
    await onPending([expense.id]);
    onNotice("Gasto devuelto a pendientes", "Deshacer", () => {
      void onTransfer([expense.id]);
    });
  };

  const remove = async (expense: Expense) => {
    if (!window.confirm(`¿Eliminar “${expense.name}”?`)) return;
    await onDelete(expense.id);
    onNotice("Gasto eliminado", "Deshacer", () => {
      void onRestore(expense.id);
    });
  };

  return (
    <section className="review-view" aria-labelledby="review-title">
      <div className="review-heading">
        <div>
          <span className="eyebrow">Pasar a Excel</span>
          <h1 id="review-title">Revisar gastos</h1>
        </div>
        <span className="pending-badge">{pendingTotal} pendiente{pendingTotal === 1 ? "" : "s"}</span>
      </div>

      <div className="review-tabs" role="tablist" aria-label="Estado de gastos">
        <button type="button" role="tab" aria-selected={status === "pending"} className={status === "pending" ? "active" : ""} onClick={() => setStatus("pending")}>Pendientes</button>
        <button type="button" role="tab" aria-selected={status === "transferred"} className={status === "transferred" ? "active" : ""} onClick={() => setStatus("transferred")}>Registrados</button>
      </div>

      <div className="review-filter-shortcuts" aria-label="Filtros rápidos">
        <button type="button" onClick={() => { setSelectedMonth(currentMonth); setPeriod("month"); }}>Mes actual</button>
        <button type="button" onClick={() => { setSelectedMonth(currentMonth); setPeriod(currentQuincena === 1 ? "q1" : "q2"); }}>Quincena actual</button>
      </div>

      <section className="review-filter" aria-label="Filtrar gastos">
        <label>
          <span>Mes</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} disabled={period === "all"}>
            {availableMonths.map((monthKey) => (
              <option key={monthKey} value={monthKey}>{formatMonthTitle(monthKey)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Mostrar</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as ReviewPeriod)}>
            <option value="month">Mes completo</option>
            <option value="q1">Quincena 1</option>
            <option value="q2">Quincena 2</option>
            <option value="all">Todos los meses</option>
          </select>
        </label>
      </section>

      <section className="review-total-sticky" aria-label={`Total de ${status === "pending" ? "pendientes" : "registrados"}`}>
        <div>
          <span>{status === "pending" ? "Total pendiente" : "Total registrado"}</span>
          <small>{periodLabel} · {filtered.length} gasto{filtered.length === 1 ? "" : "s"}</small>
        </div>
        <strong>{formatMoney(visibleTotalCents)}</strong>
      </section>

      {!groups.length ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">{status === "pending" ? "✓" : "$"}</div>
          <h2>{status === "pending" ? "No hay gastos pendientes en este período" : "No hay gastos registrados en este período"}</h2>
          <p>Cambia el filtro para revisar otro mes o quincena.</p>
        </div>
      ) : (
        <div className="month-groups">
          {groups.map((group) => (
            <section className="month-group" key={group.monthKey}>
              <h2 className="month-title">{formatMonthTitle(group.monthKey)}</h2>
              {[1, 2].map((quincenaValue) => {
                const quincena = quincenaValue as Quincena;
                const batch = group.quincenas.get(quincena) || [];
                if (!batch.length) return null;
                return (
                  <section className="quincena-group" key={quincena}>
                    <div className="quincena-header">
                      <div>
                        <h3>Quincena {quincena}</h3>
                        <span>{batch.length} gasto{batch.length === 1 ? "" : "s"} · {formatMoney(sumExpenses(batch))}</span>
                      </div>
                      {status === "pending" && (
                        <div className="batch-actions">
                          <button className="button button-secondary batch-copy" type="button" onClick={() => void copyBatch(batch)}>
                            Copiar
                          </button>
                          <button className="button button-primary batch-register" type="button" onClick={() => void transferBatch(batch)}>
                            Registrar todos
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="expense-list">
                      {batch.map((expense) => (
                        <article className="expense-card" key={expense.id}>
                          <div className="expense-main">
                            <div className="expense-title-row">
                              <h4>{expense.name}</h4>
                              <strong>{formatMoney(getExpenseTotalCents(expense))}</strong>
                            </div>
                            <div className="expense-meta">
                              <span>{formatShortDate(expense.occurredDate)}</span>
                              {expense.quantity > 1 && <span>{expense.quantity} × {formatMoney(expense.unitPriceCents)}</span>}
                            </div>
                          </div>

                          <div className="expense-actions">
                            <button type="button" onClick={() => void copyOne(expense)}>Copiar</button>
                            <button type="button" onClick={() => setEditing(expense)}>Editar</button>
                            {status === "pending" ? (
                              <button type="button" className="action-positive" onClick={() => void transfer(expense)}>Registrado</button>
                            ) : (
                              <button type="button" onClick={() => void returnToPending(expense)}>Pendiente</button>
                            )}
                            <button type="button" className="action-danger" onClick={() => void remove(expense)}>Eliminar</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditExpenseModal
          expense={editing}
          onClose={() => setEditing(null)}
          onSave={onEdit}
        />
      )}
    </section>
  );
}
