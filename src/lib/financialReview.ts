import type { FinancialData, RecordMetadata } from "../models/finance";
import type { BalanceIssue, ClosingBalance, CycleClosing } from "../models/review";
import { getMonthKey, getQuincena, getQuincenaRange, toLocalDateKey } from "./date";
import { getSavingsTransactionEffect } from "./financialCalculations";
import { moneyAccountLabel } from "./moneyLedger";
import { applyFinancialUpdates } from "./financialState";
import { createId } from "./id";

export const reviewMeta = (actor: string, existing?: RecordMetadata): RecordMetadata => {
  const now = new Date().toISOString();
  return { createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || actor,
    updatedAt: now, updatedBy: actor, version: (existing?.version || 0) + 1 };
};
export function validatePastDate(date: string, today = toLocalDateKey()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Selecciona una fecha válida.");
  if (date > today) throw new Error("No se permiten movimientos con fecha futura.");
}
export function balancesAt(data: FinancialData, cutoff: string): ClosingBalance[] {
  const accounts: ClosingBalance[] = Object.values(data.moneyAccounts).filter(a => a.active && !a.archivedAt).map(a => {
    const total = Object.values(data.moneyTransactions).filter(t => t.accountId === a.id && !t.reversedAt && t.transactionDate <= cutoff)
      .reduce((n, t) => n + (t.direction === "in" ? t.amountMinor : -t.amountMinor), a.openingBalanceMinor);
    const funds = new Set(Object.values(data.savingsFunds).filter(f => f.moneyAccountId === a.id && !f.archivedAt).map(f => f.id));
    const reserved = Object.values(data.savingsTransactions).filter(t => funds.has(t.fundId) && !t.reversedAt && t.transactionDate <= cutoff)
      .reduce((n, t) => n + getSavingsTransactionEffect(t.type, t.amountMinor), 0);
    return { key: `account:${a.id}`, kind: "account", id: a.id, name: moneyAccountLabel(a.id, data), currency: a.currency,
      calculatedMinor: total, reservedMinor: reserved, unavailable: cutoff < a.openingDate };
  });
  for (const c of Object.values(data.creditCards).filter(c => c.active && !c.archivedAt)) {
    for (const currency of ["DOP", "USD"] as const) {
      const debt = Object.values(data.cardTransactions).filter(t => t.cardId === c.id && t.currency === currency && !t.reversedAt && t.affectsCurrentBalance !== false && t.transactionDate <= cutoff)
        .reduce((n, t) => n + ((t.type === "payment" || t.type === "credit") ? -t.amountMinor : t.amountMinor), currency === "DOP" ? c.openingCurrentDebtDopMinor : c.openingCurrentDebtUsdMinor);
      accounts.push({ key: `card:${c.id}:${currency}`, kind: "card", id: c.id, name: `${c.name} · deuda ${currency}`, currency,
        calculatedMinor: debt, reservedMinor: 0, unavailable: cutoff < c.openingDate });
    }
  }
  return accounts;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Exact snapshot signature; no probabilistic hash or dependence on object insertion order. */
export function closingFingerprint(data: FinancialData, cutoff: string): string {
  const values: Record<string, unknown> = {};
  for (const group of ["moneyAccounts", "creditCards", "savingsFunds", "loans", "moneyTransactions", "cardTransactions", "savingsTransactions", "loanTransactions", "payments", "monthlyOccurrences", "nonMonthlyOccurrences", "incomeOccurrences", "managedExpenses", "balanceIssues"] as const) {
    values[group] = Object.values(data[group]).filter(item => {
      const r = item as unknown as Record<string, unknown>;
      const date = r.transactionDate || r.occurredDate || r.paidDate || r.receivedDate || r.dueDate || r.date;
      if (group === "payments" && r.historical) {
        const o = r.sourceType === "monthly" ? data.monthlyOccurrences[String(r.sourceId)] : data.nonMonthlyOccurrences[String(r.sourceId)];
        return o && ("financialMonth" in o ? getQuincenaRange(o.financialMonth, o.quincena).startDateKey : o.dueDate) <= cutoff;
      }
      return !date || String(date) <= cutoff;
    }).sort((a,b) => a.id.localeCompare(b.id));
  }
  return canonical(values);
}
export const closingNeedsReview = (data: FinancialData, c: CycleClosing): boolean => c.fingerprint !== closingFingerprint(data, c.cutoff);

export function buildClosing(data: FinancialData, month: string, quincena: 1|2, reports: Record<string, number | undefined>, notes: string, actor: string): CycleClosing {
  const cutoff = getQuincenaRange(month, quincena).endDateKey;
  validatePastDate(cutoff);
  const balances = balancesAt(data, cutoff).map(b => {
    const value = reports[b.key];
    if (value !== undefined && (!Number.isSafeInteger(value) || (b.kind === "card" && value < 0))) throw new Error("El saldo reportado no es válido.");
    return { ...b, reportedMinor: value };
  });
  if (!balances.length) throw new Error("Configura tus cuentas antes de cerrar una quincena.");
  const incomplete = balances.some(b => b.unavailable || b.reportedMinor === undefined);
  const differences = balances.some(b => b.reportedMinor !== undefined && b.reportedMinor !== b.calculatedMinor)
    || Object.values(data.balanceIssues).some(i => i.status === "pending" && i.date <= cutoff);
  const revision = Math.max(0, ...Object.values(data.cycleClosings).filter(c => c.financialMonth === month && c.quincena === quincena).map(c => c.revision)) + 1;
  return { id: `${month}_q${quincena}_v${revision}`, financialMonth: month, quincena, cutoff, revision,
    status: incomplete ? "incomplete" : differences ? "differences" : "reconciled", balances,
    fingerprint: closingFingerprint(data, cutoff), notes: notes.trim(), ...reviewMeta(actor) };
}

export function createBalanceIssues(before: FinancialData, updates: Record<string, unknown>, actor: string): BalanceIssue[] {
  const after = applyFinancialUpdates(before, updates);
  const changed = Object.entries(updates).filter(([path, value]) => /^(moneyTransactions|cardTransactions)\//.test(path) && value);
  const issues: BalanceIssue[] = [];
  const targets = new Set<string>();
  for (const [path, raw] of changed) {
    const r = raw as { accountId?: string; cardId?: string; transactionDate: string; currency: "DOP"|"USD"; type: string; description: string };
    const key = r.accountId ? `account:${r.accountId}` : `card:${r.cardId}:${r.currency}`;
    const target = key;
    if (targets.has(target)) continue;
    targets.add(target);
    const start = changed.flatMap(([p,value])=>{
      const v=value as typeof r;
      const k=v.accountId?`account:${v.accountId}`:`card:${v.cardId}:${v.currency}`;
      if(k!==key)return [];
      const old=p.startsWith("moneyTransactions/")?before.moneyTransactions[p.split("/")[1]]:before.cardTransactions[p.split("/")[1]];
      return [v.transactionDate,...(old?[old.transactionDate]:[])];
    }).sort()[0];
    const dates = [...new Set([start, toLocalDateKey(), ...Object.values(after.moneyTransactions).map(t=>t.transactionDate), ...Object.values(after.cardTransactions).map(t=>t.transactionDate), ...Object.values(after.savingsTransactions).map(t=>t.transactionDate)])].filter(d=>d>=start).sort();
    let issueDate = start;
    let worst = 0;
    for (const date of dates) {
      const entry = balancesAt(after,date).find(x=>x.key===key);
      const prior = balancesAt(before,date).find(x=>x.key===key);
      if (!entry) continue;
      const c = r.cardId ? after.creditCards[r.cardId] : undefined;
      const lim = c ? (r.currency === "USD" ? c.creditLimitUsdMinor : c.creditLimitDopMinor) : undefined;
      const free = entry.kind === "account" ? entry.calculatedMinor-entry.reservedMinor : lim===undefined?0:lim-entry.calculatedMinor;
      const oldFree = prior ? prior.kind === "account" ? prior.calculatedMinor-prior.reservedMinor : lim===undefined?0:lim-prior.calculatedMinor : 0;
      if (free < worst && free < oldFree) {worst=free;issueDate=date;}
    }
    const b = balancesAt(before, issueDate).find(x => x.key === key);
    const a = balancesAt(after, issueDate).find(x => x.key === key);
    if (!a) continue;
    const card = r.cardId ? after.creditCards[r.cardId] : undefined;
    const limit = card ? (r.currency === "USD" ? card.creditLimitUsdMinor : card.creditLimitDopMinor) : undefined;
    const current = a.kind === "account" ? a.calculatedMinor - a.reservedMinor : limit === undefined ? 0 : limit - a.calculatedMinor;
    const previous = b ? b.kind === "account" ? b.calculatedMinor - b.reservedMinor : limit === undefined ? 0 : limit - b.calculatedMinor : 0;
    if (current >= 0 || current >= previous) continue;
    if (r.type === "transfer") throw new Error("Una transferencia interna no puede dejar el origen sin fondos.");
    issues.push({ id: createId(), accountId: r.accountId, cardId: r.cardId, currency: r.currency, date: issueDate,
      description: r.description || "Movimiento pendiente de revisar", differenceMinor: -current,
      beforeMinor: previous, afterMinor: current, movementPaths: changed.filter(([,v]) => (v as typeof r).accountId === r.accountId && (v as typeof r).cardId === r.cardId).map(([p]) => p),
      status: "pending", ...reviewMeta(actor) });
    void path;
  }
  return issues;
}

export function touchedClosedCycles(before: FinancialData, after: FinancialData): CycleClosing[] {
  return Object.values(before.cycleClosings).filter(c => closingFingerprint(before, c.cutoff) !== closingFingerprint(after, c.cutoff));
}
export const cycleForDate = (date: string) => `${getMonthKey(date)} · Q${getQuincena(date)}`;
