import { useMemo, useState, type FormEvent } from "react";
import type { FinancialData, MoneyAccountId } from "../../models/finance";
import {
  getSavingsReconciliationAccounts,
  previewSavingsAccountReconciliation,
  type SavingsAccountReconciliationInput,
} from "../../lib/savingsAccountReconciliation";
import { getAccountReservedSavings, getMoneyAccountBalance, moneyAccountLabel } from "../../lib/moneyLedger";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import { toLocalDateKey } from "../../lib/date";
import { CheckboxField, Modal, MoneyField } from "./Shared";

const parseBalance = (value: string): number | null => {
  if (/^0+(?:[.,]0+)?$/.test(value.trim())) return 0;
  return parseMoneyToCents(value);
};

export function SavingsAccountReconciliationModal({ data, canReconcile, onSave, onClose }: {
  data: FinancialData;
  canReconcile: boolean;
  onSave: (input: SavingsAccountReconciliationInput) => Promise<void>;
  onClose: () => void;
}) {
  const accounts = useMemo(() => getSavingsReconciliationAccounts(data), [data]);
  const [values, setValues] = useState<Record<MoneyAccountId, string>>(() => Object.fromEntries(
    accounts.map((account) => [account.id, minorToInput(getMoneyAccountBalance(data, account.id))]),
  ));
  const [transactionDate, setTransactionDate] = useState(toLocalDateKey());
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const input: SavingsAccountReconciliationInput = {
    transactionDate,
    actualBalancesMinor: Object.fromEntries(accounts.map((account) => [
      account.id,
      parseBalance(values[account.id] || "") ?? Number.NaN,
    ])),
  };
  const preview = previewSavingsAccountReconciliation(data, input);

  const continueToPreview = (event: FormEvent) => {
    event.preventDefault();
    if (preview.errors.length) return setError(preview.errors[0]);
    setError("");
    setConfirmed(false);
    setPreviewing(true);
  };

  const confirm = async () => {
    if (!confirmed || !canReconcile) return;
    setSaving(true);
    setError("");
    try {
      await onSave(input);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la reconciliación.");
    } finally {
      setSaving(false);
    }
  };

  return <Modal title="Unificar cuentas y ahorros" onClose={onClose} confirmClose>
    {!previewing ? <form className="form-grid" onSubmit={continueToPreview}>
      <p className="privacy-note">Escribe el saldo total que muestra hoy cada cuenta. Los fondos vinculados se tratarán como una parte apartada de ese total; no se sumarán nuevamente.</p>
      <label className="field"><span>Fecha de los saldos</span><input type="date" max={toLocalDateKey()} value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
      <div className="reconciliation-list savings-reconciliation-list">
        {accounts.map((account) => {
          const current = getMoneyAccountBalance(data, account.id);
          const reserved = getAccountReservedSavings(data, account.id);
          return <article key={account.id}>
            <span><strong>{moneyAccountLabel(account.id, data)}</strong><small>Registrado ahora: {formatCurrency(current, account.currency)} · Apartado en ahorros: {formatCurrency(reserved, account.currency)}</small></span>
            <MoneyField label="Saldo total real" value={values[account.id] || ""} onChange={(value) => setValues((currentValues) => ({ ...currentValues, [account.id]: value }))} currency={account.currency} />
          </article>;
        })}
      </div>
      {!data.lastBackupAt && <p className="form-error">Descarga primero un respaldo JSON actualizado desde Configuración.</p>}
      {!canReconcile && <p className="form-warning">Espera a que todos los cambios estén sincronizados y vuelve a abrir esta ventana.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={!data.lastBackupAt || !canReconcile}>Revisar resultado</button></div>
    </form> : <div className="form-grid">
      <p className="privacy-note">Revisa el resultado antes de confirmar. Ningún fondo, tarjeta, préstamo ni historial será eliminado.</p>
      <div className="reconciliation-preview-list">
        {preview.entries.map((entry) => <article key={entry.accountId}>
          <header><strong>{moneyAccountLabel(entry.accountId, data)}</strong><span>{entry.currency}</span></header>
          <dl>
            <div><dt>Saldo total</dt><dd>{formatCurrency(entry.actualBalanceMinor, entry.currency)}</dd></div>
            <div><dt>Apartado en ahorros</dt><dd>{formatCurrency(entry.reservedSavingsMinor, entry.currency)}</dd></div>
            <div><dt>Disponible sin apartar</dt><dd>{formatCurrency(entry.availableUnreservedMinor, entry.currency)}</dd></div>
            <div><dt>Ajuste que se registrará</dt><dd>{entry.adjustmentMinor === 0 ? "Sin ajuste" : `${entry.adjustmentMinor > 0 ? "+" : "−"}${formatCurrency(Math.abs(entry.adjustmentMinor), entry.currency)}`}</dd></div>
          </dl>
        </article>)}
      </div>
      <div className="reconciliation-confirm"><CheckboxField checked={confirmed} onChange={setConfirmed} label="Confirmo que estos son los saldos totales reales" help="Esta reconciliación está diseñada para ejecutarse una sola vez desde este dispositivo." /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => { setPreviewing(false); setConfirmed(false); }}>Corregir saldos</button><button type="button" className="button button-primary" disabled={!confirmed || saving || !canReconcile} onClick={() => void confirm()}>{saving ? "Guardando…" : "Confirmar unificación"}</button></div>
    </div>}
  </Modal>;
}
