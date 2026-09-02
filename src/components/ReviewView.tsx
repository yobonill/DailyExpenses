import { useMemo, useState } from "react";
import type { Expense, ExpenseEditableFields, ExpensePaymentMethod } from "../models/expense";
import {
  formatBudgetCycleRange,
  formatMonthTitle,
  formatQuincenaRange,
  formatShortDate,
  getMonthKey,
  getQuincena,
  toLocalDateKey,
  type Quincena,
} from "../lib/date";
import { formatCurrency } from "../lib/money";
import { EditExpenseModal } from "./EditExpenseModal";

interface ReviewViewProps {
  expenses: Expense[];
  activeCardName?: string;
  onEdit: (expenseId: string, changes: ExpenseEditableFields) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRestore: (expense: Expense) => Promise<void>;
  onNotice: (message: string, actionLabel?: string, action?: () => void) => void;
}

interface ExpenseGroup {
  monthKey: string;
  quincenas: Map<Quincena, Expense[]>;
}

type ReviewPeriod = "month" | "q1" | "q2" | "all";

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Efectivo",
  debit: "Débito",
  transfer: "Transferencia",
  creditCard: "Tarjeta de crédito",
};

const expenseCurrency = (expense: Expense) => expense.currency === "USD" ? "USD" : "DOP";
const expensePaymentMethod = (expense: Expense): ExpensePaymentMethod => expense.paymentMethod || "cash";
const expenseTotal = (expense: Expense): number => expense.unitPriceCents * expense.quantity;

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

const sumExpenses = (expenses: Expense[], currency: "DOP" | "USD"): number =>
  expenses
    .filter((expense) => expenseCurrency(expense) === currency)
    .reduce((total, expense) => total + expenseTotal(expense), 0);

export function ReviewView({ expenses, activeCardName, onEdit, onDelete, onRestore, onNotice }: ReviewViewProps) {
  const todayKey = toLocalDateKey();
  const currentMonth = getMonthKey(todayKey);
  const currentQuincena = getQuincena(todayKey);
  const [period, setPeriod] = useState<ReviewPeriod>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Expense | null>(null);

  const availableMonths = useMemo(() => {
    const months = new Set(expenses.map((expense) => getMonthKey(expense.occurredDate)));
    months.add(currentMonth);
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [expenses, currentMonth]);

  const filtered = useMemo(() => expenses.filter((expense) => {
    if (period === "all") return true;
    if (getMonthKey(expense.occurredDate) !== selectedMonth) return false;
    if (period === "q1") return getQuincena(expense.occurredDate) === 1;
    if (period === "q2") return getQuincena(expense.occurredDate) === 2;
    return true;
  }), [expenses, period, selectedMonth]);

  const groups = useMemo(() => groupExpenses(filtered), [filtered]);
  const visibleDop = useMemo(() => sumExpenses(filtered, "DOP"), [filtered]);
  const visibleUsd = useMemo(() => sumExpenses(filtered, "USD"), [filtered]);
  const periodLabel = useMemo(() => {
    if (period === "all") return "Todos los meses";
    const month = formatMonthTitle(selectedMonth);
    if (period === "q1") return `${month} · Quincena 1 · ${formatQuincenaRange(selectedMonth, 1)}`;
    if (period === "q2") return `${month} · Quincena 2 · ${formatQuincenaRange(selectedMonth, 2)}`;
    return `${month} · ${formatBudgetCycleRange(selectedMonth)}`;
  }, [period, selectedMonth]);

  const remove = async (expense: Expense) => {
    if (!window.confirm(`¿Eliminar “${expense.name}”? Su efecto financiero también será retirado.`)) return;
    try {
      await onDelete(expense.id);
      onNotice("Gasto eliminado", "Deshacer", () => void onRestore(expense));
    } catch (reason) {
      onNotice(reason instanceof Error ? reason.message : "No se pudo eliminar el gasto.");
    }
  };

  return (
    <section className="review-view" aria-labelledby="review-title">
      <div className="review-heading"><div><span className="eyebrow">Movimientos realizados</span><h1 id="review-title">Historial de gastos</h1></div></div>

      <div className="review-filter-shortcuts" aria-label="Filtros rápidos">
        <button type="button" onClick={() => { setSelectedMonth(currentMonth); setPeriod("month"); }}>Mes actual</button>
        <button type="button" onClick={() => { setSelectedMonth(currentMonth); setPeriod(currentQuincena === 1 ? "q1" : "q2"); }}>Quincena actual</button>
      </div>

      <section className="review-filter" aria-label="Filtrar gastos">
        <label><span>Mes</span><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} disabled={period === "all"}>{availableMonths.map((monthKey) => <option key={monthKey} value={monthKey}>{formatMonthTitle(monthKey)} · {formatBudgetCycleRange(monthKey)}</option>)}</select></label>
        <label><span>Mostrar</span><select value={period} onChange={(event) => setPeriod(event.target.value as ReviewPeriod)}><option value="month">Mes completo</option><option value="q1">Quincena 1</option><option value="q2">Quincena 2</option><option value="all">Todos los meses</option></select></label>
      </section>

      <section className="review-total-sticky" aria-label="Total de gastos del período">
        <div><span>Total de gastos extras</span><small>{periodLabel} · {filtered.length} gasto{filtered.length === 1 ? "" : "s"}</small></div>
        <div className="history-total-values"><strong>{formatCurrency(visibleDop, "DOP")}</strong>{visibleUsd > 0 && <strong>{formatCurrency(visibleUsd, "USD")}</strong>}</div>
      </section>

      {!groups.length ? <div className="empty-state"><div className="empty-icon" aria-hidden="true">$</div><h2>No hay gastos en este período</h2><p>Cambia el filtro para consultar otro mes o quincena.</p></div> : (
        <div className="month-groups">{groups.map((group) => <section className="month-group" key={group.monthKey}>
          <h2 className="month-title">{formatMonthTitle(group.monthKey)} · {formatBudgetCycleRange(group.monthKey)}</h2>
          {[1, 2].map((quincenaValue) => {
            const quincena = quincenaValue as Quincena;
            const batch = group.quincenas.get(quincena) || [];
            if (!batch.length) return null;
            const batchDop = sumExpenses(batch, "DOP");
            const batchUsd = sumExpenses(batch, "USD");
            return <section className="quincena-group" key={quincena}>
              <div className="quincena-header"><div><h3>Quincena {quincena} · {formatQuincenaRange(group.monthKey, quincena)}</h3><span>{batch.length} gasto{batch.length === 1 ? "" : "s"} · {formatCurrency(batchDop, "DOP")}{batchUsd > 0 ? ` · ${formatCurrency(batchUsd, "USD")}` : ""}</span></div></div>
              <div className="expense-list">{batch.map((expense) => {
                const method = expensePaymentMethod(expense);
                const currency = expenseCurrency(expense);
                return <article className="expense-card" key={expense.id}>
                  <div className="expense-main"><div className="expense-title-row"><h4>{expense.name}</h4><strong>{formatCurrency(expenseTotal(expense), currency)}</strong></div><div className="expense-meta"><span>{formatShortDate(expense.occurredDate)}</span>{expense.quantity > 1 && <span>{expense.quantity} × {formatCurrency(expense.unitPriceCents, currency)}</span>}<span>{PAYMENT_LABELS[method]}{method === "creditCard" && activeCardName ? ` · ${activeCardName}` : ""}</span>{expense.category && <span>{expense.category}</span>}</div></div>
                  <div className="expense-actions history-expense-actions"><button type="button" onClick={() => setEditing(expense)}>Editar</button><button type="button" className="action-danger" onClick={() => void remove(expense)}>Eliminar</button></div>
                </article>;
              })}</div>
            </section>;
          })}
        </section>)}</div>
      )}

      {editing && <EditExpenseModal expense={editing} activeCardName={activeCardName} onClose={() => setEditing(null)} onSave={onEdit} />}
    </section>
  );
}
