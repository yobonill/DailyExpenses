import type { FinancialData } from "../models/finance";
import type { BalanceIssue } from "../models/review";
import { formatMonthTitle, getMonthKey, getQuincena, getQuincenaRange } from "./date";
import { moneyAccountLabel } from "./moneyLedger";

export type IssuePeriod = { month: string; quincena: 1 | 2 };

export function groupBalanceIssues(data: FinancialData, period?: IssuePeriod) {
  const groups = new Map<string, { month: string; quincena: 1 | 2; title: string; range: ReturnType<typeof getQuincenaRange>; issues: BalanceIssue[] }>();
  for (const issue of Object.values(data.balanceIssues)) {
    const month = getMonthKey(issue.date), quincena = getQuincena(issue.date);
    if (period && (month !== period.month || quincena !== period.quincena)) continue;
    const key = `${month}_${quincena}`;
    if (!groups.has(key)) groups.set(key, { month, quincena, title: `${formatMonthTitle(month)} · Quincena ${quincena}`, range: getQuincenaRange(month, quincena), issues: [] });
    groups.get(key)!.issues.push(issue);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => ({
    key, ...group,
    issues: group.issues.sort((a, b) => Number(a.status === "reviewed") - Number(b.status === "reviewed") || b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)),
  }));
}

export function balanceIssueExplanation(data: FinancialData, issue: BalanceIssue) {
  const isCard = Boolean(issue.cardId);
  return {
    product: isCard ? data.creditCards[issue.cardId!]?.name || "Tarjeta no disponible" : issue.accountId ? moneyAccountLabel(issue.accountId, data) : "Cuenta no disponible",
    reason: isCard ? "Límite de tarjeta excedido" : "Fondos disponibles insuficientes",
    basis: isCard ? "Disponible = límite configurado de la tarjeta menos deuda calculada." : "Disponible = saldo calculado de la cuenta menos dinero apartado para ahorros.",
    before: issue.beforeMinor,
    after: issue.afterMinor,
    // The total shortfall differs from the reduction in available funds caused by the correction.
    shortfall: issue.differenceMinor,
    availableReduction: Math.max(0, issue.beforeMinor - issue.afterMinor),
    amountLabel: isCard ? "Exceso total sobre el límite detectado" : "Faltante total detectado",
    guidance: isCard ? "Revisa el límite configurado, los cargos y los pagos registrados hasta esa fecha." : "Revisa el saldo inicial, los ingresos, los retiros y el dinero apartado hasta esa fecha.",
  };
}
