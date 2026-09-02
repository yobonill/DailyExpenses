import { useMemo, useState, type FormEvent } from "react";
import { formatShortDate, getMonthKey, toLocalDateKey } from "../../lib/date";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import type { Currency, FinancialData, IncomeOccurrence, IncomeTemplate } from "../../models/finance";
import type { IncomeTemplateInput, OneTimeIncomeInput } from "../../hooks/useFinanceActions";
import { CheckboxField, CurrencyField, EmptyPanel, Modal, MoneyField, PageHeading, PeriodSelector, StatusChip } from "./Shared";

const EXCEL_INCOME_ROWS = ["Nomina yor", "Picota Talo", "Danny Picota", "Jorge reye josue"];
const NEW_EXCEL_ROW = "__new__";
const NO_EXCEL_ROW = "__none__";

function IncomeFormModal({ template, onSaveTemplate, onCreateOneTime, onClose }: {
  template?: IncomeTemplate;
  onSaveTemplate: (input: IncomeTemplateInput, id?: string) => Promise<void>;
  onCreateOneTime: (input: OneTimeIncomeInput) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"recurring" | "oneTime">("recurring");
  const [name, setName] = useState(template?.name || "");
  const [amount, setAmount] = useState(minorToInput(template?.expectedAmountMinor));
  const [currency, setCurrency] = useState<Currency>(template?.currency || "DOP");
  const [incomeType, setIncomeType] = useState<"salary" | "recurringOther">(template?.incomeType || "salary");
  const [day, setDay] = useState(String(template?.dueRule.day || 15));
  const [lastDay, setLastDay] = useState(template?.dueRule.kind === "lastDay");
  const [date, setDate] = useState(toLocalDateKey());
  const [active, setActive] = useState(template?.active ?? true);
  const initialExcelLabel = template?.excelRowLabel || "";
  const [excelRowSelection, setExcelRowSelection] = useState(
    !initialExcelLabel
      ? NEW_EXCEL_ROW
      : EXCEL_INCOME_ROWS.includes(initialExcelLabel) ? initialExcelLabel : NEW_EXCEL_ROW,
  );
  const [customExcelRow, setCustomExcelRow] = useState(
    initialExcelLabel && !EXCEL_INCOME_ROWS.includes(initialExcelLabel) ? initialExcelLabel : "",
  );
  const [exportExpected, setExportExpected] = useState(template?.exportExpectedWhenPending ?? true);
  const [notes, setNotes] = useState(template?.notes || "");
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const expectedAmountMinor = parseMoneyToCents(amount); const dueDay = Number(day);
    if (!name.trim() || !expectedAmountMinor) return setError("Completa el nombre y el monto esperado.");
    if (mode === "recurring" && !lastDay && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return setError("El día debe estar entre 1 y 31.");
    setSaving(true); setError("");
    try {
      const excelRowLabel = excelRowSelection === NEW_EXCEL_ROW
        ? customExcelRow.trim() || name.trim()
        : excelRowSelection === NO_EXCEL_ROW ? undefined : excelRowSelection;
      if (mode === "oneTime") await onCreateOneTime({ name, expectedAmountMinor, currency, expectedDate: date, notes, excelRowLabel, exportExpectedWhenPending: exportExpected });
      else await onSaveTemplate({ name, expectedAmountMinor, currency, incomeType, dueRule: lastDay ? { kind: "lastDay" } : { kind: "day", day: dueDay }, active, notes, excelRowLabel, exportExpectedWhenPending: exportExpected }, template?.id);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  };
  return <Modal title={template ? "Editar ingreso" : "Nuevo ingreso"} onClose={onClose}><form className="form-grid" onSubmit={submit}>
    {!template && <fieldset className="choice-field"><legend>Frecuencia</legend><label><input type="radio" checked={mode === "recurring"} onChange={() => setMode("recurring")} /> Recurrente</label><label><input type="radio" checked={mode === "oneTime"} onChange={() => setMode("oneTime")} /> Una sola vez</label></fieldset>}
    <label className="field"><span>Fuente</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
    <div className="form-columns"><MoneyField label="Monto esperado" value={amount} onChange={setAmount} currency={currency} /><CurrencyField value={currency} onChange={setCurrency} /></div>
    {mode === "recurring" && <label className="field"><span>Tipo</span><select value={incomeType} onChange={(event) => setIncomeType(event.target.value as typeof incomeType)}><option value="salary">Salario</option><option value="recurringOther">Otro recurrente</option></select></label>}
    {mode === "oneTime" ? <label className="field"><span>Fecha esperada</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label> : <div className="form-columns"><label className="field"><span>Día esperado</span><input type="number" min="1" max="31" value={day} disabled={lastDay} onChange={(event) => setDay(event.target.value)} /></label><CheckboxField checked={lastDay} onChange={setLastDay} label="Último día del mes" /></div>}
    {mode === "recurring" && <CheckboxField checked={active} onChange={setActive} label="Ingreso activo" help="Mientras esté activo, la aplicación seguirá creando este ingreso en los meses siguientes." />}
    <CheckboxField checked={exportExpected} onChange={setExportExpected} label="Incluir el monto esperado en el Excel antes de recibirlo" help="Activado: se exporta el monto planificado aunque todavía aparezca como Esperado. Desactivado: solo se exporta después de marcarlo como recibido." />
    <label className="field"><span>Fila en Excel</span><select value={excelRowSelection} onChange={(event) => setExcelRowSelection(event.target.value)}><option value={NEW_EXCEL_ROW}>Crear una nueva fila</option>{EXCEL_INCOME_ROWS.map((row) => <option value={row} key={row}>Usar: {row}</option>)}<option value={NO_EXCEL_ROW}>Sin asignar por ahora</option></select><small className="field-help">Los ingresos asignados a la misma fila se combinan al exportar.</small></label>
    {excelRowSelection === NEW_EXCEL_ROW && <label className="field"><span>Nombre de la nueva fila</span><input value={customExcelRow} onChange={(event) => setCustomExcelRow(event.target.value)} placeholder={name.trim() || "Nombre de la fila"} /><small className="field-help">Si queda vacío, se utilizará el nombre del ingreso.</small></label>}
    {excelRowSelection === NO_EXCEL_ROW && <p className="form-warning">Este ingreso bloqueará la exportación del año hasta que le asignes una fila.</p>}
    <label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
  </form></Modal>;
}

function ReceiveModal({ occurrence, onConfirm, onClose }: { occurrence: IncomeOccurrence; onConfirm: (amount: number, date: string) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState(minorToInput(occurrence.expectedAmountMinor)); const [date, setDate] = useState(toLocalDateKey()); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); const value = parseMoneyToCents(amount); if (!value) return setError("Monto inválido."); setSaving(true); try { await onConfirm(value, date); onClose(); } catch { setError("No se pudo registrar el ingreso."); } finally { setSaving(false); } };
  return <Modal title={`Marcar recibido · ${occurrence.name}`} onClose={onClose}><form className="form-grid" onSubmit={submit}><div className="form-summary"><span>Esperado</span><strong>{formatCurrency(occurrence.expectedAmountMinor, occurrence.currency)}</strong></div><MoneyField label="Monto recibido" value={amount} onChange={setAmount} currency={occurrence.currency} /><label className="field"><span>Fecha recibida</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Confirmar</button></div></form></Modal>;
}

export function IncomeView({ data, onSaveTemplate, onCreateOneTime, onReceive, onReopen }: {
  data: FinancialData;
  onSaveTemplate: (input: IncomeTemplateInput, id?: string) => Promise<void>;
  onCreateOneTime: (input: OneTimeIncomeInput) => Promise<void>;
  onReceive: (id: string, amount: number, date: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
}) {
  const [monthKey, setMonthKey] = useState(getMonthKey(toLocalDateKey())); const [quincena, setQuincena] = useState<"all" | 1 | 2>("all");
  const [form, setForm] = useState<IncomeTemplate | "new" | null>(null); const [receiving, setReceiving] = useState<IncomeOccurrence | null>(null);
  const items = useMemo(() => Object.values(data.incomeOccurrences).filter((item) => item.financialMonth === monthKey && (quincena === "all" || item.quincena === quincena)).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)), [data.incomeOccurrences, monthKey, quincena]);
  const templates = useMemo(() => Object.values(data.incomeTemplates).filter((item) => !item.archivedAt).sort((a, b) => a.name.localeCompare(b.name)), [data.incomeTemplates]);
  const expected = (currency: Currency) => items.filter((item) => item.currency === currency && item.status !== "cancelled").reduce((total, item) => total + item.expectedAmountMinor, 0);
  const received = (currency: Currency) => items.filter((item) => item.currency === currency && item.status === "received").reduce((total, item) => total + (item.actualAmountMinor ?? item.expectedAmountMinor), 0);
  return <section className="finance-page"><PageHeading eyebrow="Dinero que entra" title="Ingresos" action={<button className="button button-primary heading-action" type="button" onClick={() => setForm("new")}>＋ Agregar</button>} /><PeriodSelector monthKey={monthKey} onMonthChange={setMonthKey} quincena={quincena} onQuincenaChange={setQuincena} />
    <div className="metric-grid"><article><span>Esperado DOP</span><strong>{formatCurrency(expected("DOP"), "DOP")}</strong></article><article><span>Recibido DOP</span><strong>{formatCurrency(received("DOP"), "DOP")}</strong></article><article><span>Esperado USD</span><strong>{formatCurrency(expected("USD"), "USD")}</strong></article><article><span>Recibido USD</span><strong>{formatCurrency(received("USD"), "USD")}</strong></article></div>
    {!items.length ? <EmptyPanel title="Sin ingresos" text="Agrega tu salario, otra fuente recurrente o un ingreso puntual." /> : <div className="finance-list">{items.map((item) => <article className="finance-row-card" key={item.id}><div className="finance-row-main"><div><div className="row-title-line"><h3>{item.name}</h3><StatusChip status={item.status} label={item.status === "received" ? "Recibido" : item.status === "cancelled" ? "Cancelado" : "Esperado"} /></div><p>{formatShortDate(item.expectedDate)} · Q{item.quincena} · {item.incomeType === "salary" ? "Salario" : item.incomeType === "oneTime" ? "Único" : "Recurrente"}</p></div><strong>{formatCurrency(item.status === "received" ? item.actualAmountMinor ?? item.expectedAmountMinor : item.expectedAmountMinor, item.currency)}</strong></div><div className="row-actions">{item.status === "expected" ? <button className="button button-primary" type="button" onClick={() => setReceiving(item)}>Marcar recibido</button> : item.status === "received" ? <button className="button button-secondary" type="button" onClick={() => { if (window.confirm("¿Reabrir este ingreso esperado?")) void onReopen(item.id); }}>Corregir / reabrir</button> : null}</div></article>)}</div>}
    <section className="management-section"><div className="section-title-row"><div><span className="eyebrow">Configuración</span><h2>Fuentes recurrentes</h2></div></div>{!templates.length ? <p className="muted-panel">No hay fuentes recurrentes.</p> : <div className="template-list">{templates.map((template) => <article key={template.id}><div><strong>{template.name}</strong><span>{formatCurrency(template.expectedAmountMinor, template.currency)} · {template.dueRule.kind === "lastDay" ? "Último día" : `Día ${template.dueRule.day}`}</span></div><StatusChip status={template.active ? "paid" : "cancelled"} label={template.active ? "Activa" : "Inactiva"} /><div className="inline-actions"><button type="button" onClick={() => setForm(template)}>Editar</button></div></article>)}</div>}</section>
    {form && <IncomeFormModal template={form === "new" ? undefined : form} onSaveTemplate={onSaveTemplate} onCreateOneTime={onCreateOneTime} onClose={() => setForm(null)} />}{receiving && <ReceiveModal occurrence={receiving} onConfirm={(amount, date) => onReceive(receiving.id, amount, date)} onClose={() => setReceiving(null)} />}
  </section>;
}
