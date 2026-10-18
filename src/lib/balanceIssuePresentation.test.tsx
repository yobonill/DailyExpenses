import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyFinancialData } from "./financialState";
import { reviewMeta } from "./financialReview";
import { balanceIssueExplanation, groupBalanceIssues } from "./balanceIssuePresentation";
import { BalanceIssuePanel } from "../components/BalanceIssuePanel";
import type { BalanceIssue } from "../models/review";

const issue = (id: string, date: string): BalanceIssue => ({ id, date, cardId: "card", currency: "DOP", description: "Central depot", differenceMinor: 260682, beforeMinor: -260681, afterMinor: -260682, movementPaths: ["cardTransactions/charge"], status: "pending", ...reviewMeta("user") });
function fixture() {
  const data = createEmptyFinancialData();
  data.creditCards.card = { id: "card", name: "Scotiabank Bravo", bank: "Scotiabank", active: true, openingDate: "2026-07-30", openingCurrentDebtDopMinor: 0, openingCurrentDebtUsdMinor: 0, cutDay: 10, dueDay: 25, ...reviewMeta("user") };
  data.balanceIssues.old = issue("old", "2026-10-14");
  data.balanceIssues.current = issue("current", "2026-10-16");
  data.balanceIssues.end = { ...issue("end", "2026-10-30"), status: "reviewed", resolution: "Pago corregido y verificado" };
  return data;
}
describe("incidences by financial cycle", () => {
  it("places dates 14, 16 and 30 in the correct monthly cycle and quincena", () => {
    const groups = groupBalanceIssues(fixture());
    expect(groups.map(g => [g.month, g.quincena, g.issues.map(i => i.id)])).toEqual([
      ["2026-10", 2, ["end"]], ["2026-10", 1, ["current"]], ["2026-09", 2, ["old"]],
    ]);
  });
  it("scopes the closing panel to its selected quincena", () => {
    const data = fixture();
    expect(groupBalanceIssues(data, { month: "2026-09", quincena: 2 }).flatMap(g => g.issues.map(i => i.id))).toEqual(["old"]);
    const html = renderToStaticMarkup(<BalanceIssuePanel data={data} actor="user" period={{ month: "2026-09", quincena: 2 }} onCommit={async()=>{}}/>);
    expect(html).toContain("Problema detectado al 2026-10-14");
    expect(html).not.toContain("Problema detectado al 2026-10-16");
    expect(html).toContain("de esta quincena: 1 pendientes");
  });
  it("separates total excess from the one-cent availableReduction caused by a correction", () => {
    const data = fixture();
    expect(balanceIssueExplanation(data, data.balanceIssues.current)).toMatchObject({ product: "Scotiabank Bravo", reason: "Límite de tarjeta excedido", before: -260681, after: -260682, shortfall: 260682, availableReduction: 1 });
    const html = renderToStaticMarkup(<BalanceIssuePanel data={data} actor="user" onCommit={async()=>{}}/>);
    expect(html).toContain("Disponible antes del cambio");
    expect(html).toContain("Disponible después del cambio");
    expect(html).toContain("Exceso total sobre el límite detectado");
    expect(html).toContain("RD$0.01");
    expect(html).toContain("Pago corregido y verificado");
    expect(html).toContain("no modifica saldos ni movimientos");
  });
  it("explains bank shortfalls using available money after savings reserves", () => {
    const data = fixture();
    const bankIssue = { ...issue("account", "2026-10-16"), cardId: undefined, accountId: "cash", beforeMinor: 500, afterMinor: -1000, differenceMinor: 1000 };
    expect(balanceIssueExplanation(data, bankIssue)).toMatchObject({ reason: "Fondos disponibles insuficientes", basis: "Disponible = saldo calculado de la cuenta menos dinero apartado para ahorros.", shortfall: 1000, availableReduction: 1500 });
  });
  it("shows an explicit empty state for a selected quincena", () => {
    const html = renderToStaticMarkup(<BalanceIssuePanel data={fixture()} actor="user" period={{ month: "2026-08", quincena: 1 }} onCommit={async()=>{}}/>);
    expect(html).toContain("Sin incidencias registradas en esta quincena");
  });
});
