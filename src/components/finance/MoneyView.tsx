import { useMemo, useState, type FormEvent } from "react";
import type { BankInput, MoneyAccountInput } from "../../hooks/useFinanceActions";
import type { Bank, BankAccountType, Currency, FinancialData, MoneyAccount, MoneyAccountId } from "../../models/finance";
import { formatShortDate, toLocalDateKey } from "../../lib/date";
import { buildAccountCenterGroups } from "../../lib/accountCenter";
import { getCardCurrentDebt, getFundBalance } from "../../lib/financialCalculations";
import { getLoanBalance } from "../../lib/loanLedger";
import { formatCurrency, minorToInput, parseMoneyToCents } from "../../lib/money";
import {
  BANK_ACCOUNT_TYPE_LABELS,
  CASH_ACCOUNT_ID,
  LEGACY_BANK_ACCOUNT_ID,
  calculateTransferFeeMinor,
  getBankAccounts,
  getLegacyBankBalance,
  getMoneyAccountBalance,
  getTotalBankBalance,
  getTotalMoneyAvailable,
  moneyAccountLabel,
} from "../../lib/moneyLedger";
import { CheckboxField, EmptyPanel, Modal, MoneyField, PageHeading, StatusChip } from "./Shared";

function BankForm({ bank, onSave, onClose }: {
  bank?: Bank;
  onSave: (input: BankInput, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(bank?.name || "");
  const [active, setActive] = useState(bank?.active ?? true);
  const [notes, setNotes] = useState(bank?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Escribe el nombre del banco.");
    setSaving(true); setError("");
    try { await onSave({ name, active, notes }, bank?.id); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el banco."); }
    finally { setSaving(false); }
  };
  return <Modal title={bank ? "Editar banco" : "Agregar banco"} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}>
    <label className="field"><span>Nombre del banco</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Scotiabank" /></label>
    {bank && <CheckboxField checked={active} onChange={setActive} label="Banco activo" help="Si lo desactivas, sus cuentas conservarán el historial, pero no aparecerán como origen de nuevos pagos." />}
    <label className="field"><span>Notas (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar banco"}</button></div>
  </form></Modal>;
}

function AccountForm({ data, bank, account, onSave, onClose }: {
  data: FinancialData;
  bank: Bank;
  account?: MoneyAccount;
  onSave: (input: MoneyAccountInput, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const hasHistory = Boolean(account && Object.values(data.moneyTransactions).some((item) => item.accountId === account.id));
  const legacyBalance = getLegacyBankBalance(data);
  const [name, setName] = useState(account?.name || "");
  const [accountType, setAccountType] = useState<BankAccountType>(account?.accountType || "savings");
  const [currency, setCurrency] = useState<Currency>(account?.currency || "DOP");
  const [lastFour, setLastFour] = useState(account?.lastFour || "");
  const [openingBalance, setOpeningBalance] = useState(minorToInput(account?.openingBalanceMinor));
  const [openingDate, setOpeningDate] = useState(account?.openingDate || toLocalDateKey());
  const [active, setActive] = useState(account?.active ?? true);
  const [notes, setNotes] = useState(account?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const openingBalanceMinor = parseMoneyToCents(openingBalance) ?? 0;
    if (!name.trim()) return setError("Escribe el nombre de la cuenta.");
    setSaving(true); setError("");
    try {
      await onSave({ bankId: bank.id, name, accountType, currency, lastFour, openingBalanceMinor, openingDate, active, notes }, account?.id);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la cuenta."); }
    finally { setSaving(false); }
  };
  return <Modal title={account ? "Editar cuenta" : `Nueva cuenta · ${bank.name}`} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}>
    <label className="field"><span>Nombre de la cuenta</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Nómina, Ahorros o Pagos" /></label>
    <div className="form-columns"><label className="field"><span>Tipo de cuenta</span><select value={accountType} onChange={(event) => setAccountType(event.target.value as BankAccountType)}>{Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Moneda</span><select value={currency} disabled={hasHistory} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="DOP">Pesos dominicanos (DOP)</option><option value="USD">Dólares (USD)</option></select></label></div>
    <label className="field"><span>Últimos 4 dígitos (opcional)</span><input inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, "").slice(-4))} /></label>
    <div className="form-columns"><MoneyField label="Balance inicial" value={openingBalance} onChange={setOpeningBalance} currency={currency} /><label className="field"><span>Fecha del balance</span><input type="date" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} /></label></div>
    {!account && currency === "DOP" && legacyBalance > 0 && <p className="form-warning">Existe {formatCurrency(legacyBalance, "DOP")} en el saldo bancario anterior. Crea esta cuenta en cero y luego usa “Distribuir saldo”.</p>}
    {hasHistory && <p className="form-warning">El banco, moneda, balance inicial y fecha ya no pueden cambiarse porque existe historial. Usa “Ajustar balance”.</p>}
    <CheckboxField checked={active} onChange={setActive} label="Cuenta activa" />
    <label className="field"><span>Notas (opcional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar cuenta"}</button></div>
  </form></Modal>;
}

function CashSetupModal({ onSave, onClose }: {
  onSave: (balance: number, date: string) => Promise<void>;
  onClose: () => void;
}) {
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(toLocalDateKey());
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = parseMoneyToCents(balance) ?? 0;
    if (!confirmed) return setError("Confirma que el saldo incluye los movimientos anteriores.");
    setSaving(true); setError("");
    try { await onSave(value, date); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo configurar Efectivo."); }
    finally { setSaving(false); }
  };
  return <Modal title="Configurar efectivo" onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}>
    <MoneyField label="Efectivo disponible ahora" value={balance} onChange={setBalance} required={false} />
    <label className="field"><span>Fecha del saldo</span><input type="date" max={toLocalDateKey()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <CheckboxField checked={confirmed} onChange={setConfirmed} label="Este saldo ya incluye los movimientos anteriores" />
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Guardar efectivo</button></div>
  </form></Modal>;
}

function AdjustModal({ data, accountId, onSave, onClose }: {
  data: FinancialData;
  accountId: MoneyAccountId;
  onSave: (accountId: MoneyAccountId, exact: number, date: string, notes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const current = getMoneyAccountBalance(data, accountId);
  const currency = data.moneyAccounts[accountId]?.currency || "DOP";
  const [amount, setAmount] = useState(minorToInput(current));
  const [date, setDate] = useState(toLocalDateKey());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); const exact = parseMoneyToCents(amount); if (exact === null) return setError("Escribe el balance exacto."); setSaving(true); setError(""); try { await onSave(accountId, exact, date, notes); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ajustar."); } finally { setSaving(false); } };
  return <Modal title={`Ajustar · ${moneyAccountLabel(accountId, data)}`} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}><div className="form-summary"><span>Balance calculado</span><strong>{formatCurrency(current, currency)}</strong></div><MoneyField label="Balance exacto actual" value={amount} onChange={setAmount} currency={currency} /><label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>Motivo o nota</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Balance confirmado en la aplicación del banco" /></label><p className="privacy-note">Se registrará la diferencia como un ajuste y se conservará el historial anterior.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Guardar ajuste</button></div></form></Modal>;
}

function TransferModal({ data, legacyOnly = false, onSave, onClose }: {
  data: FinancialData;
  legacyOnly?: boolean;
  onSave: (from: MoneyAccountId, to: MoneyAccountId, amount: number, date: string, fee: number, notes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const bankAccounts = getBankAccounts(data).filter((account) => account.active && data.banks[account.bankId || ""]?.active);
  const cash = data.moneyAccounts[CASH_ACCOUNT_ID];
  const legacy = data.moneyAccounts[LEGACY_BANK_ACCOUNT_ID];
  const availableAccounts = [...bankAccounts, ...(cash?.active ? [cash] : [])];
  const sources = legacyOnly ? (legacy ? [legacy] : []) : availableAccounts;
  const [from, setFrom] = useState<MoneyAccountId>(sources[0]?.id || "");
  const source = data.moneyAccounts[from];
  const destinations = availableAccounts.filter((account) => account.id !== from && account.currency === source?.currency);
  const [to, setTo] = useState<MoneyAccountId>(destinations[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toLocalDateKey());
  const [includeFee, setIncludeFee] = useState(false);
  const parsedAmount = parseMoneyToCents(amount) || 0;
  const automaticFee = calculateTransferFeeMinor(parsedAmount, data.settings.transferFeeRatePercent);
  const [manualFee, setManualFee] = useState("");
  const fee = includeFee ? parseMoneyToCents(manualFee) ?? automaticFee : 0;
  const [notes, setNotes] = useState(legacyOnly ? "Distribución del saldo bancario anterior" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggleFee = (checked: boolean) => { setIncludeFee(checked); if (checked) setManualFee(minorToInput(automaticFee)); else setManualFee(""); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!parsedAmount || !from || !to) return setError("Selecciona origen, destino y un monto válido."); setSaving(true); setError(""); try { await onSave(from, to, parsedAmount, date, fee, notes); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo mover el dinero."); } finally { setSaving(false); } };
  return <Modal title={legacyOnly ? "Distribuir saldo anterior" : "Mover dinero"} onClose={onClose} confirmClose><form className="form-grid" onSubmit={submit}>
    <label className="field"><span>Desde</span><select value={from} disabled={legacyOnly} onChange={(event) => { const next = event.target.value; const nextCurrency = data.moneyAccounts[next]?.currency; setFrom(next); setTo(availableAccounts.find((account) => account.id !== next && account.currency === nextCurrency)?.id || ""); setIncludeFee(false); setManualFee(""); }}>{sources.map((account) => <option key={account.id} value={account.id}>{moneyAccountLabel(account.id, data)} · {account.currency}</option>)}</select></label>
    <label className="field"><span>Hacia</span><select value={to} onChange={(event) => setTo(event.target.value)}><option value="">Seleccionar cuenta</option>{destinations.map((account) => <option key={account.id} value={account.id}>{moneyAccountLabel(account.id, data)}</option>)}</select></label>
    {source && <div className="form-summary"><span>Disponible en origen</span><strong>{formatCurrency(getMoneyAccountBalance(data, source.id), source.currency)}</strong></div>}
    <MoneyField label="Monto" value={amount} onChange={(value) => { setAmount(value); if (includeFee) setManualFee(minorToInput(calculateTransferFeeMinor(parseMoneyToCents(value) || 0, data.settings.transferFeeRatePercent))); }} currency={source?.currency || "DOP"} />
    <label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    {!legacyOnly && source?.kind === "bank" && <><CheckboxField checked={includeFee} onChange={toggleFee} label="Agregar comisión por transferencia" help={`Calcula ${data.settings.transferFeeRatePercent}% y permite editar el resultado.`} />{includeFee && <MoneyField label="Comisión" value={manualFee} onChange={setManualFee} currency={source.currency} required={false} />}</>}
    <label className="field"><span>Notas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={saving}>Confirmar movimiento</button></div>
  </form></Modal>;
}

const movementLabel = (type: string): string => ({ income: "Ingreso", payment: "Pago", expense: "Gasto", cardPayment: "Pago de tarjeta", loanPayment: "Pago de préstamo", transfer: "Movimiento interno", fee: "Comisión", adjustment: "Ajuste" })[type] || "Movimiento";

export function MoneyView({ data, onSaveBank, onDeleteBank, onSaveAccount, onInitializeCash, onAdjust, onTransfer, onOpenSection }: {
  data: FinancialData;
  onSaveBank: (input: BankInput, id?: string) => Promise<void>;
  onDeleteBank: (bankId: string) => Promise<void>;
  onSaveAccount: (input: MoneyAccountInput, id?: string) => Promise<void>;
  onInitializeCash: (balance: number, date: string) => Promise<void>;
  onAdjust: (accountId: MoneyAccountId, exact: number, date: string, notes?: string) => Promise<void>;
  onTransfer: (from: MoneyAccountId, to: MoneyAccountId, amount: number, date: string, fee: number, notes?: string) => Promise<void>;
  onOpenSection: (section: "savings" | "cards" | "loans") => void;
}) {
  const [bankForm, setBankForm] = useState<Bank | "new" | null>(null);
  const [accountForm, setAccountForm] = useState<{ bank: Bank; account?: MoneyAccount } | null>(null);
  const [cashSetup, setCashSetup] = useState(false);
  const [adjusting, setAdjusting] = useState<MoneyAccountId | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const center = useMemo(() => buildAccountCenterGroups(data), [data]);
  const banks = center.banks;
  const accounts = useMemo(() => getBankAccounts(data), [data]);
  const cash = data.moneyAccounts[CASH_ACCOUNT_ID];
  const legacyBalance = getLegacyBankBalance(data);
  const transactions = useMemo(() => Object.values(data.moneyTransactions).filter((item) => !item.reversedAt).sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.createdAt.localeCompare(a.createdAt)), [data.moneyTransactions]);
  const savingsDop = Object.values(data.savingsFunds).filter((fund) => !fund.archivedAt && fund.currency === "DOP").reduce((total, fund) => total + getFundBalance(data, fund.id), 0);
  const savingsUsd = Object.values(data.savingsFunds).filter((fund) => !fund.archivedAt && fund.currency === "USD").reduce((total, fund) => total + getFundBalance(data, fund.id), 0);
  const card = Object.values(data.creditCards).find((item) => !item.archivedAt);
  const cardDebtDop = card ? getCardCurrentDebt(data, card.id, "DOP") : 0;
  const cardDebtUsd = card ? getCardCurrentDebt(data, card.id, "USD") : 0;
  const loanDop = Object.values(data.loans).filter((loan) => !loan.archivedAt && loan.currency === "DOP").reduce((total, loan) => total + getLoanBalance(data, loan.id), 0);
  const loanUsd = Object.values(data.loans).filter((loan) => !loan.archivedAt && loan.currency === "USD").reduce((total, loan) => total + getLoanBalance(data, loan.id), 0);
  const unassignedCount = center.unassignedSavingsFunds.length + center.unassignedCards.length + center.unassignedLoans.length;

  return <section className="finance-page">
    <PageHeading eyebrow="Dinero, reservas y deudas" title="Resumen por banco" action={<button className="button button-primary heading-action" type="button" onClick={() => setBankForm("new")}>＋ Banco</button>} />
    <div className="projection-grid account-center-summary">
      <article className="projection-card projection-card-featured positive"><span>Dinero disponible</span><strong>{formatCurrency(getTotalMoneyAvailable(data, "DOP"), "DOP")}</strong><small>{formatCurrency(getTotalMoneyAvailable(data, "USD"), "USD")} · Bancos DOP {formatCurrency(getTotalBankBalance(data, "DOP"), "DOP")} · Efectivo {cash ? formatCurrency(getMoneyAccountBalance(data, CASH_ACCOUNT_ID), "DOP") : "sin configurar"}</small></article>
      <article className="projection-card"><span>Ahorros reservados</span><strong>{formatCurrency(savingsDop, "DOP")}</strong><small>{formatCurrency(savingsUsd, "USD")} · No se suman otra vez al disponible.</small><button className="text-button" type="button" onClick={() => onOpenSection("savings")}>Administrar ahorros</button></article>
      <article className="projection-card"><span>Deuda de tarjeta</span><strong>{formatCurrency(cardDebtDop, "DOP")}</strong><small>{formatCurrency(cardDebtUsd, "USD")}</small><button className="text-button" type="button" onClick={() => onOpenSection("cards")}>Administrar tarjeta</button></article>
      <article className="projection-card"><span>Préstamos pendientes</span><strong>{formatCurrency(loanDop, "DOP")}</strong><small>{formatCurrency(loanUsd, "USD")}</small><button className="text-button" type="button" onClick={() => onOpenSection("loans")}>Administrar préstamos</button></article>
    </div>

    {legacyBalance > 0 && <section className="legacy-bank-panel"><div><span className="eyebrow">Actualización desde 1.6.0</span><h2>Saldo bancario por distribuir</h2><p>{formatCurrency(legacyBalance, "DOP")} permanece intacto. Crea tus bancos y cuentas, luego distribuye este total entre ellas.</p></div><button className="button button-primary" type="button" disabled={!accounts.length} onClick={() => setDistributing(true)}>Distribuir saldo</button></section>}

    <article className="bank-panel cash-center-panel"><header><div><span>Disponible fuera de bancos</span><h2>Efectivo</h2></div><strong>{cash ? formatCurrency(getMoneyAccountBalance(data, CASH_ACCOUNT_ID), "DOP") : "Sin configurar"}</strong></header>
      {center.cashSavingsFunds.length > 0 && <div className="bank-product-section"><div className="bank-product-heading"><span>Ahorros guardados aquí</span><button type="button" onClick={() => onOpenSection("savings")}>Administrar</button></div>{center.cashSavingsFunds.map((fund) => <div className="bank-product-row" key={fund.id}><span><strong>{fund.name}</strong><small>Fondo de ahorro · {fund.currency}</small></span><b>{formatCurrency(getFundBalance(data, fund.id), fund.currency)}</b></div>)}</div>}
      <div className="row-actions">{cash ? <button className="button button-secondary" type="button" onClick={() => setAdjusting(CASH_ACCOUNT_ID)}>Ajustar efectivo</button> : <button className="button button-primary" type="button" onClick={() => setCashSetup(true)}>Configurar efectivo</button>}</div>
    </article>

    {!banks.length ? <EmptyPanel title="Agrega tus bancos" text="Después podrás crear cuentas y vincularles tus ahorros, tarjeta y préstamos." /> : <div className="bank-grid">{banks.map((group) => {
      const bank = group.bank;
      const bankAccounts = group.accounts;
      const bankTotalDop = bankAccounts.filter((account) => account.currency === "DOP").reduce((total, account) => total + getMoneyAccountBalance(data, account.id), 0);
      const bankTotalUsd = bankAccounts.filter((account) => account.currency === "USD").reduce((total, account) => total + getMoneyAccountBalance(data, account.id), 0);
      return <article className="bank-panel" key={bank.id}><header><div><span>{bank.active ? "Banco activo" : "Banco inactivo"}</span><h2>{bank.name}</h2></div><div><strong>{formatCurrency(bankTotalDop, "DOP")}</strong><small>{formatCurrency(bankTotalUsd, "USD")}</small></div></header>
        <div className="bank-account-list">{bankAccounts.length ? bankAccounts.map((account) => <div className="bank-account-row" key={account.id}><span><strong>{account.name}</strong><small>{BANK_ACCOUNT_TYPE_LABELS[account.accountType || "other"]} · {account.currency}{account.lastFour ? ` · •••• ${account.lastFour}` : ""}</small></span><span><b>{formatCurrency(getMoneyAccountBalance(data, account.id), account.currency)}</b><small>{account.active ? "Activa" : "Inactiva"}</small></span><div className="inline-actions"><button type="button" onClick={() => setAdjusting(account.id)}>Ajustar</button><button type="button" onClick={() => setAccountForm({ bank, account })}>Editar</button></div></div>) : <p className="muted-panel">Este banco todavía no tiene cuentas.</p>}</div>
        {group.savingsFunds.length > 0 && <div className="bank-product-section"><div className="bank-product-heading"><span>Ahorros</span><button type="button" onClick={() => onOpenSection("savings")}>Administrar</button></div>{group.savingsFunds.map((fund) => <div className="bank-product-row" key={fund.id}><span><strong>{fund.name}</strong><small>{fund.moneyAccountId ? moneyAccountLabel(fund.moneyAccountId, data) : "Sin cuenta"}</small></span><b>{formatCurrency(getFundBalance(data, fund.id), fund.currency)}</b></div>)}</div>}
        {group.cards.length > 0 && <div className="bank-product-section"><div className="bank-product-heading"><span>Tarjeta</span><button type="button" onClick={() => onOpenSection("cards")}>Administrar</button></div>{group.cards.map((linkedCard) => <div className="bank-product-row" key={linkedCard.id}><span><strong>{linkedCard.name}</strong><small>Deuda {formatCurrency(getCardCurrentDebt(data, linkedCard.id, "DOP"), "DOP")} · {formatCurrency(getCardCurrentDebt(data, linkedCard.id, "USD"), "USD")}</small></span><StatusChip status={linkedCard.active ? "paid" : "cancelled"} label={linkedCard.active ? "Activa" : "Inactiva"} /></div>)}</div>}
        {group.loans.length > 0 && <div className="bank-product-section"><div className="bank-product-heading"><span>Préstamos</span><button type="button" onClick={() => onOpenSection("loans")}>Administrar</button></div>{group.loans.map((loan) => <div className="bank-product-row" key={loan.id}><span><strong>{loan.name}</strong><small>Capital pendiente</small></span><b>{formatCurrency(getLoanBalance(data, loan.id), loan.currency)}</b></div>)}</div>}
        <div className="row-actions"><button className="button button-secondary" type="button" onClick={() => setAccountForm({ bank })}>＋ Cuenta</button><button className="button button-quiet" type="button" onClick={() => setBankForm(bank)}>Editar banco</button>{bankAccounts.length === 0 && group.cards.length === 0 && group.loans.length === 0 && <button className="button button-quiet danger-text" type="button" onClick={() => { if (window.confirm(`¿Eliminar el banco vacío “${bank.name}”?`)) void onDeleteBank(bank.id); }}>Eliminar</button>}</div>
      </article>;
    })}</div>}

    {unassignedCount > 0 && <section className="unassigned-products-panel"><div><span className="eyebrow">Migración segura</span><h2>Pendiente de organizar</h2><p>Estos datos ya existían y se conservaron sin modificar. Asígnalos a una cuenta o banco cuando estés listo.</p></div>
      {center.unassignedSavingsFunds.length > 0 && <div className="unassigned-product-group"><span>Ahorros</span>{center.unassignedSavingsFunds.map((fund) => <strong key={fund.id}>{fund.name} · {formatCurrency(getFundBalance(data, fund.id), fund.currency)}</strong>)}<button type="button" onClick={() => onOpenSection("savings")}>Organizar ahorros</button></div>}
      {center.unassignedCards.length > 0 && <div className="unassigned-product-group"><span>Tarjeta</span>{center.unassignedCards.map((unassignedCard) => <strong key={unassignedCard.id}>{unassignedCard.name}</strong>)}<button type="button" onClick={() => onOpenSection("cards")}>Asignar banco</button></div>}
      {center.unassignedLoans.length > 0 && <div className="unassigned-product-group"><span>Préstamos</span>{center.unassignedLoans.map((loan) => <strong key={loan.id}>{loan.name}</strong>)}<button type="button" onClick={() => onOpenSection("loans")}>Asignar banco</button></div>}
    </section>}

    {(accounts.length > 0 || cash) && <div className="finance-toolbar"><button className="button button-primary" type="button" onClick={() => setTransferring(true)}>Mover entre cuentas</button></div>}

    <section className="management-section"><div className="section-title-row"><div><span className="eyebrow">Trazabilidad</span><h2>Historial de dinero</h2></div></div>{transactions.length ? <div className="ledger-list">{transactions.map((item) => <div key={item.id}><span><strong>{item.description}</strong><small>{formatShortDate(item.transactionDate)} · {moneyAccountLabel(item.accountId, data)} · {movementLabel(item.type)}</small>{item.notes && <small>{item.notes}</small>}</span><b className={item.direction === "in" ? "debt-down" : "debt-up"}>{item.direction === "in" ? "+" : "−"}{formatCurrency(item.amountMinor, item.currency)}</b></div>)}</div> : <p className="muted-panel">Todavía no hay movimientos posteriores a los saldos iniciales.</p>}</section>

    {bankForm && <BankForm bank={bankForm === "new" ? undefined : bankForm} onSave={onSaveBank} onClose={() => setBankForm(null)} />}
    {accountForm && <AccountForm data={data} bank={accountForm.bank} account={accountForm.account} onSave={onSaveAccount} onClose={() => setAccountForm(null)} />}
    {cashSetup && <CashSetupModal onSave={onInitializeCash} onClose={() => setCashSetup(false)} />}
    {adjusting && <AdjustModal data={data} accountId={adjusting} onSave={onAdjust} onClose={() => setAdjusting(null)} />}
    {transferring && <TransferModal data={data} onSave={onTransfer} onClose={() => setTransferring(false)} />}
    {distributing && <TransferModal data={data} legacyOnly onSave={onTransfer} onClose={() => setDistributing(false)} />}
  </section>;
}
