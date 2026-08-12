import { useMemo, useState } from "react";
import type { Expense, ExpenseStatus } from "../models/expense";
import { formatMonthTitle, formatShortDate, getMonthKey, getQuincena, type Quincena } from "../lib/date";
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

export function ReviewView({
  expenses,
  onEdit,
  onTransfer,
  onPending,
  onDelete,
  onRestore,
  onNotice,
}: ReviewViewProps) {
  const [status, setStatus] = useState<ExpenseStatus>("pending");
  const [editing, setEditing] = useState<Expense | null>(null);

  const filtered = useMemo(
    () => expenses.filter((expense) => expense.status === status),
    [expenses, status],
  );
  const groups = useMemo(() => groupExpenses(filtered), [filtered]);
  const pendingTotal = expenses.filter((expense) => expense.status === "pending").length;

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
      const ids = batch.map((expense) => expense.id);
      onNotice(
        `${batch.length} gasto${batch.length === 1 ? "" : "s"} copiado${batch.length === 1 ? "" : "s"}`,
        "Marcar registrados",
        () => {
          void onTransfer(ids);
        },
      );
    } catch {
      onNotice("No se pudo copiar al portapapeles.");
    }
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

      {!groups.length ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">{status === "pending" ? "✓" : "$"}</div>
          <h2>{status === "pending" ? "No hay gastos pendientes" : "Todavía no hay gastos registrados"}</h2>
          <p>{status === "pending" ? "Los nuevos gastos aparecerán aquí organizados por mes y quincena." : "Cuando marques un gasto como registrado en Excel quedará disponible aquí."}</p>
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
                        <span>{batch.length} gasto{batch.length === 1 ? "" : "s"}</span>
                      </div>
                      {status === "pending" && (
                        <button className="button button-secondary batch-copy" type="button" onClick={() => void copyBatch(batch)}>
                          Copiar {batch.length}
                        </button>
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
