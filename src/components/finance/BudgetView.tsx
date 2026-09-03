import { useMemo, useState, type FormEvent } from "react";
import { EXPENSE_CATEGORIES, isPredefinedExpenseCategory } from "../../config/financeCategories";
import { filterBudgetOccurrences, type BudgetStatusFilter } from "../../lib/budgetFilters";
import { formatShortDate, getMonthKey, toLocalDateKey } from "../../lib/date";
import { deriveDatedStatus, monthlyVariance, statusLabel } from "../../lib/financialCalculations";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type { CreditCard, Currency, FinancialData, MonthlyExpenseOccurrence, MonthlyExpenseTemplate } from "../../models/finance";
import type { MonthlyTemplateInput, OneTimeMonthlyInput } from "../../hooks/useFinanceActions";
import { CheckboxField, CurrencyField, EmptyPanel, Modal, MoneyField, PageHeading, PayModal, PeriodSelector, StatusChip, type PayModalValue } from "./Shared";

const defaultPlannedQuincena = (template?: MonthlyExpenseTemplate): 1 | 2 => {
  if (template?.plannedQuincena) return template.plannedQuincena;
  if (template?.dueRule.kind === "lastDay") return 2;
  const day = template?.dueRule.day ?? 15;
  return day <= 14 || day >= 30 ? 2 : 1;
};

interface BudgetViewProps {
  data: FinancialData;
  onSaveTemplate: (input: MonthlyTemplateInput, id?: string) => Promise<void>;
  onArchiveTemplate: (id: string) => Promise<void>;
  onCreateOneTime: (input: OneTimeMonthlyInput) => Promise<void>;
  onUpdateOneTime: (id: string, input: OneTimeMonthlyInput) => Promise<void>;
  onPay: (value: PayModalValue & { sourceType: "monthly"; sourceId: string; currency: Currency }) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
}

function MonthlyFormModal({ template, occurrence, onSaveTemplate, onCreateOneTime, onUpdateOneTime, onClose }: {
  template?: MonthlyExpenseTemplate;
  occurrence?: MonthlyExpenseOccurrence;
  onSaveTemplate: (input: MonthlyTemplateInput, id?: string) => Promise<void>;
  onCreateOneTime: (input: OneTimeMonthlyInput) => Promise<void>;
  onUpdateOneTime: (id: string, input: OneTimeMonthlyInput) => Promise<void>;
  onClose: () => void;
}) {
  const source = template ?? occurrence;
  const [mode, setMode] = useState<"recurring" | "oneTime">(occurrence ? "oneTime" : "recurring");
  const [name, setName] = useState(source?.name || "");
  const [category, setCategory] = useState(source?.category || "");
  const [amount, setAmount] = useState(minorToInput(template?.estimatedAmountMinor ?? occurrence?.expectedAmountMinor));
  const [currency, setCurrency] = useState<Currency>(source?.currency || "DOP");
  const [dueDay, setDueDay] = useState(String(template?.dueRule.day || 15));
  const [lastDay, setLastDay] = useState(template?.dueRule.kind === "lastDay");
  const [dueDate, setDueDate] = useState(occurrence?.dueDate || toLocalDateKey());
  const [plannedQuincena, setPlannedQuincena] = useState<1 | 2>(occurrence?.quincena ?? defaultPlannedQuincena(template));
  const [variableAmount, setVariableAmount] = useState(template?.variableAmount ?? false);
  const [canPayWithCard, setCanPayWithCard] = useState(source?.canPayWithCard ?? true);
  const [active, setActive] = useState(template?.active ?? true);
  const [notes, setNotes] = useState(source?.notes || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const estimatedAmountMinor = parseMoneyToCents(amount);
    const day = Number(dueDay);
    if (!name.trim() || !estimatedAmountMinor) return setError("Completa el nombre y el monto esperado.");
    if (mode === "recurring" && !lastDay && (!Number.isInteger(day) || day < 1 || day > 31)) return setError("El día debe estar entre 1 y 31.");
    setSaving(true); setError("");
    try {
      const common = { name, category, estimatedAmountMinor, currency, dueRule: lastDay ? { kind: "lastDay" as const } : { kind: "day" as const, day }, plannedQuincena, variableAmount, canPayWithCard, active, notes };
      if (occurrence) await onUpdateOneTime(occurrence.id, { ...common, dueDate });
      else if (mode === "oneTime") await onCreateOneTime({ ...common, dueDate });
      else await onSaveTemplate(common, template?.id);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  };
  return (
    <Modal title={occurrence ? "Editar gasto de una sola vez" : template ? "Editar gasto mensual" : "Nuevo gasto de presupuesto"} onClose={onClose} confirmClose>
      <form className="form-grid" onSubmit={submit}>
        {!template && !occurrence && <fieldset className="choice-field"><legend>Tipo</legend><label><input type="radio" checked={mode === "recurring"} onChange={() => setMode("recurring")} /> Se repite cada mes</label><label><input type="radio" checked={mode === "oneTime"} onChange={() => setMode("oneTime")} /> Solo una vez</label></fieldset>}
        {template && <p className="form-warning">Los cambios se aplicarán a esta plantilla y a todas sus obligaciones pendientes que ya se hayan generado.</p>}
        <label className="field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field"><span>Categoría (opcional)</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Sin categoría</option>{category && !isPredefinedExpenseCategory(category) && <option value={category}>{category} (anterior)</option>}{EXPENSE_CATEGORIES.map((item) => <option value={item} key={item}>{item}</option>)}</select><small className="field-help">Se usa para agrupar las obligaciones en Reportes.</small></label>
        <div className="form-columns"><MoneyField label="Monto esperado" value={amount} onChange={setAmount} currency={currency} /><CurrencyField value={currency} onChange={setCurrency} /></div>
        {mode === "oneTime" ? <label className="field"><span>Fecha de pago</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label> : <div className="form-columns"><label className="field"><span>Día de vencimiento</span><input type="number" min="1" max="31" value={dueDay} disabled={lastDay} onChange={(event) => setDueDay(event.target.value)} /></label><CheckboxField checked={lastDay} onChange={setLastDay} label="Último día del mes" /></div>}
        <label className="field"><span>Quincena planificada</span><select value={plannedQuincena} onChange={(event) => setPlannedQuincena(Number(event.target.value) as 1 | 2)}><option value={1}>Quincena 1</option><option value={2}>Quincena 2</option></select><small className="field-help">Define de cuál quincena saldrá el dinero. El vencimiento continúa controlando los avisos.</small></label>
        <CheckboxField checked={variableAmount} onChange={setVariableAmount} label="Monto variable" help="El estimado se conserva y podrás registrar el valor real al pagar." />
        <CheckboxField checked={canPayWithCard} onChange={setCanPayWithCard} label="Se puede pagar con tarjeta" />
        {mode === "recurring" && <CheckboxField checked={active} onChange={setActive} label="Repetir automáticamente cada mes" help="Si la pausas, se conserva el período actual y se eliminan únicamente las proyecciones futuras sin pagar." />}
        <label className="field"><span>Notas (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
      </form>
    </Modal>
  );
}

type EditingBudgetItem = { kind: "new" } | { kind: "template"; template: MonthlyExpenseTemplate } | { kind: "oneTime"; occurrence: MonthlyExpenseOccurrence };

export function BudgetView({ data, onSaveTemplate, onArchiveTemplate, onCreateOneTime, onUpdateOneTime, onPay, onReopen, onCancel }: BudgetViewProps) {
  const [monthKey, setMonthKey] = useState(getMonthKey(toLocalDateKey()));
  const [quincena, setQuincena] = useState<"all" | 1 | 2>("all");
  const [editingItem, setEditingItem] = useState<EditingBudgetItem | null>(null);
  const [paying, setPaying] = useState<MonthlyExpenseOccurrence | null>(null);
  const [initialPayMethod, setInitialPayMethod] = useState<"cash" | "creditCard">("cash");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<BudgetStatusFilter>("all");
  const todayKey = toLocalDateKey();
  const periodOccurrences = useMemo(() => Object.values(data.monthlyOccurrences)
    .filter((item) => item.financialMonth === monthKey && (quincena === "all" || item.quincena === quincena))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [data.monthlyOccurrences, monthKey, quincena]);
  const availableCategories = useMemo(() => Array.from(new Set(periodOccurrences.map((item) => item.category).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, "es")), [periodOccurrences]);
  const occurrences = useMemo(() => filterBudgetOccurrences(periodOccurrences, {
    search,
    category: categoryFilter,
    status: statusFilter,
    todayKey,
    dueSoonDays: data.settings.dueSoonDaysMonthly,
  }), [categoryFilter, data.settings.dueSoonDaysMonthly, periodOccurrences, search, statusFilter, todayKey]);
  const filtersActive = Boolean(search.trim() || categoryFilter || statusFilter !== "all");
  const clearFilters = () => { setSearch(""); setCategoryFilter(""); setStatusFilter("all"); };
  const templates = useMemo(() => Object.values(data.monthlyTemplates).filter((item) => !item.archivedAt).sort((a, b) => a.name.localeCompare(b.name)), [data.monthlyTemplates]);
  const cards = useMemo(() => Object.values(data.creditCards).filter((item) => item.active && !item.archivedAt), [data.creditCards]);
  const totals = (currency: Currency) => {
    const rows = periodOccurrences.filter((item) => item.currency === currency && item.status !== "cancelled");
    return {
      expected: rows.reduce((total, item) => total + item.expectedAmountMinor, 0),
      paid: rows.reduce((total, item) => total + (item.status === "paid" ? item.actualAmountMinor ?? item.expectedAmountMinor : 0), 0),
      pending: rows.reduce((total, item) => total + (item.status === "upcoming" ? item.expectedAmountMinor : 0), 0),
      variance: rows.reduce((total, item) => total + monthlyVariance(item), 0),
    };
  };
  const dop = totals("DOP"); const usd = totals("USD");

  return (
    <section className="finance-page">
      <PageHeading eyebrow="Plan mensual" title="Presupuesto" action={<button type="button" className="button button-primary heading-action" onClick={() => setEditingItem({ kind: "new" })}>＋ Agregar</button>} />
      <PeriodSelector monthKey={monthKey} onMonthChange={setMonthKey} quincena={quincena} onQuincenaChange={setQuincena} />
      <div className="metric-grid four-metrics">
        <article><span>Esperado DOP</span><strong>{formatCurrency(dop.expected, "DOP")}</strong></article><article><span>Pagado DOP</span><strong>{formatCurrency(dop.paid, "DOP")}</strong></article><article><span>Pendiente DOP</span><strong>{formatCurrency(dop.pending, "DOP")}</strong></article><article className={dop.variance > 0 ? "metric-alert" : ""}><span>Variación DOP</span><strong>{formatCurrency(dop.variance, "DOP")}</strong></article>
      </div>
      {(usd.expected > 0 || usd.paid > 0) && <div className="currency-note">USD · Esperado {formatCurrency(usd.expected, "USD")} · Pagado {formatCurrency(usd.paid, "USD")} · Pendiente {formatCurrency(usd.pending, "USD")}</div>}

      {periodOccurrences.length > 0 && <section className="budget-filter-panel" aria-label="Buscar y filtrar obligaciones"><div className="budget-filter-grid"><label className="field budget-search-field"><span>Buscar obligación</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, categoría o fila de Excel" /></label><label className="field"><span>Categoría</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas las categorías</option><option value="uncategorized">Sin categoría</option>{availableCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label className="field"><span>Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BudgetStatusFilter)}><option value="all">Todos los estados</option><option value="payable">Por pagar</option><option value="overdue">Vencidos</option><option value="paid">Pagados</option><option value="cancelled">No aplican</option></select></label></div><div className="budget-filter-summary"><span>Mostrando <strong>{occurrences.length}</strong> de {periodOccurrences.length} obligaciones</span>{filtersActive && <button type="button" className="text-button" onClick={clearFilters}>Limpiar filtros</button>}</div></section>}

      {!periodOccurrences.length ? <EmptyPanel title="Sin obligaciones" text="Agrega una plantilla mensual o un pago único para este período." /> : !occurrences.length ? <EmptyPanel title="Sin coincidencias" text="No hay obligaciones que coincidan con la búsqueda y los filtros seleccionados." /> : <div className="finance-list">{occurrences.map((item) => {
        const derived = deriveDatedStatus(item, toLocalDateKey(), data.settings.dueSoonDaysMonthly);
        return <article className="finance-row-card" key={item.id}><div className="finance-row-main"><div><div className="row-title-line"><h3>{item.name}</h3><StatusChip status={derived} label={statusLabel(derived)} /></div><p>{formatShortDate(item.dueDate)} · Q{item.quincena}{item.category ? ` · ${item.category}` : ""}</p>{item.status === "paid" && <small>Real: {formatCurrency(item.actualAmountMinor ?? item.expectedAmountMinor, item.currency)} · Variación {formatCurrency(monthlyVariance(item), item.currency)}</small>}</div><strong>{formatCurrency(item.expectedAmountMinor, item.currency)}</strong></div><div className="row-actions">{item.status === "upcoming" && <><button type="button" className="button button-primary" onClick={() => { setInitialPayMethod("cash"); setPaying(item); }}>Pagar</button>{item.canPayWithCard && <button type="button" className="button button-secondary" onClick={() => { setInitialPayMethod("creditCard"); setPaying(item); }}>Pagar con tarjeta</button>}<button type="button" className="button button-secondary" onClick={() => item.templateId ? setEditingItem({ kind: "template", template: data.monthlyTemplates[item.templateId] }) : setEditingItem({ kind: "oneTime", occurrence: item })} disabled={Boolean(item.templateId && !data.monthlyTemplates[item.templateId])}>Editar</button><button type="button" className="button button-quiet danger-text" onClick={() => { const recurrenceText = item.templateId ? " La plantilla seguirá activa para los demás meses." : ""; if (window.confirm(`“${item.name}” dejará de contarse como gasto en este período.${recurrenceText}\n\n¿Marcar como No aplica?`)) void onCancel(item.id); }}>No aplica</button></>}{item.status === "paid" && <button type="button" className="button button-secondary" onClick={() => { if (window.confirm("¿Reabrir este pago? También se revertirán sus movimientos vinculados.")) void onReopen(item.id); }}>Corregir / reabrir</button>}</div></article>;
      })}</div>}

      <section className="management-section"><div className="section-title-row"><div><span className="eyebrow">Configuración</span><h2>Gastos recurrentes</h2></div></div>
        {!templates.length ? <p className="muted-panel">Aún no hay plantillas mensuales.</p> : <div className="template-list">{templates.map((template) => <article key={template.id}><div><strong>{template.name}</strong><span>{formatCurrency(template.estimatedAmountMinor, template.currency)} · Q{template.plannedQuincena ?? defaultPlannedQuincena(template)} · {template.dueRule.kind === "lastDay" ? "Último día" : `Día ${template.dueRule.day}`}{template.category ? ` · ${template.category}` : ""}</span></div><StatusChip status={template.active ? "paid" : "cancelled"} label={template.active ? "Activa" : "Pausada"} /><div className="inline-actions"><button type="button" onClick={() => setEditingItem({ kind: "template", template })}>Editar</button><button type="button" className="danger-text" onClick={() => { if (window.confirm("La historia se conservará. ¿Archivar esta plantilla?")) void onArchiveTemplate(template.id); }}>Archivar</button></div></article>)}</div>}
      </section>

      {editingItem && <MonthlyFormModal template={editingItem.kind === "template" ? editingItem.template : undefined} occurrence={editingItem.kind === "oneTime" ? editingItem.occurrence : undefined} onSaveTemplate={onSaveTemplate} onCreateOneTime={onCreateOneTime} onUpdateOneTime={onUpdateOneTime} onClose={() => setEditingItem(null)} />}
      {paying && <PayModal title={paying.name} expectedMinor={paying.expectedAmountMinor} currency={paying.currency} canPayWithCard={paying.canPayWithCard} cards={cards as CreditCard[]} initialMethod={initialPayMethod} onClose={() => setPaying(null)} onConfirm={(value) => onPay({ ...value, sourceType: "monthly", sourceId: paying.id, currency: paying.currency })} />}
    </section>
  );
}
