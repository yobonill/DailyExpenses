import { useState } from "react";
import type { FinancialData } from "../models/finance";
import { balanceIssueExplanation, groupBalanceIssues, type IssuePeriod } from "../lib/balanceIssuePresentation";
import { reviewMeta } from "../lib/financialReview";
import { formatCurrency } from "../lib/money";

export function BalanceIssuePanel({ data, actor, onCommit, period }: { data: FinancialData; actor: string; onCommit: (patch: Record<string, unknown>) => Promise<void>; period?: IssuePeriod }) {
  const [error, setError] = useState("");
  const groups = groupBalanceIssues(data, period);
  const pending = groups.reduce((total, group) => total + group.issues.filter(i => i.status === "pending").length, 0);
  if (!groups.length) return period ? <p className="muted-panel">Sin incidencias registradas en esta quincena.</p> : null;
  const resolve = async (id: string) => {
    const issue = data.balanceIssues[id];
    const explanation = balanceIssueExplanation(data, issue);
    const resolution = window.prompt(`${explanation.product} · ${explanation.reason} al ${issue.date}.\nDisponible: ${formatCurrency(issue.beforeMinor, issue.currency)} → ${formatCurrency(issue.afterMinor, issue.currency)}.\n\nExplica qué verificaste o corregiste. Marcar como revisada no cambia saldos ni movimientos.`);
    if (!resolution?.trim()) return;
    setError("");
    try { await onCommit({ [`balanceIssues/${id}`]: { ...issue, status: "reviewed", resolution: resolution.trim(), ...reviewMeta(actor, issue) } }); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
  };
  return <details className="balance-review-card">
    <summary>Incidencias{period ? " de esta quincena" : " por ciclo y quincena"}: {pending} pendientes</summary>
    <p>Se agrupan por la fecha en que se detectó el problema, que puede ser posterior a la fecha del movimiento corregido. Los importes muestran lo calculado al registrar la incidencia; no son una comparación con el saldo reportado al cierre.</p>
    {groups.map(group => {
      const pendingCount = group.issues.filter(i => i.status === "pending").length;
      const closing = Object.values(data.cycleClosings).filter(c => c.financialMonth === group.month && c.quincena === group.quincena).sort((a, b) => b.revision - a.revision)[0];
      return <details className="balance-review-card" key={group.key} open={Boolean(period)}>
        <summary>{group.title} · {pendingCount} pendientes · {group.issues.length - pendingCount} revisadas</summary>
        <p>{group.range.startDateKey} al {group.range.endDateKey} · {closing ? `Con cierre guardado (revisión ${closing.revision})` : "Sin cierre guardado"}</p>
        {group.issues.map(issue => {
          const info = balanceIssueExplanation(data, issue);
          return <article key={issue.id}>
            <h3>{info.product} · {issue.currency}</h3>
            <strong>{info.reason}</strong>
            <p>Movimiento relacionado: {issue.description}</p>
            <p>Problema detectado al {issue.date} · {issue.status === "pending" ? "Pendiente de revisar" : "Revisada"}</p>
            <p>{info.basis}</p>
            <dl className="settings-details">
              <div><dt>Disponible antes del cambio</dt><dd>{formatCurrency(info.before, issue.currency)}</dd></div>
              <div><dt>Disponible después del cambio</dt><dd>{formatCurrency(info.after, issue.currency)}</dd></div>
              <div><dt>{info.amountLabel}</dt><dd>{formatCurrency(info.shortfall, issue.currency)}</dd></div>
              <div><dt>Reducción del disponible por este cambio</dt><dd>{formatCurrency(info.availableReduction, issue.currency)}</dd></div>
            </dl>
            <p>El faltante total no es el importe del movimiento ni un ajuste adicional que debas registrar.</p>
            <p>{info.guidance} Si ya corregiste y verificaste los datos, marca la incidencia como revisada y explica la comprobación.</p>
            {issue.resolution && <p><strong>Explicación guardada:</strong> {issue.resolution}</p>}
            {issue.status === "pending" && <button className="text-button" onClick={() => void resolve(issue.id)}>Marcar como revisada con explicación</button>}
          </article>;
        })}
      </details>;
    })}
    <p>Marcar como revisada conserva la incidencia y no modifica saldos ni movimientos. Las correcciones posteriores no actualizan automáticamente estos importes históricos.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </details>;
}
