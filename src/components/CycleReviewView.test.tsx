import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyFinancialData } from "../lib/financialState";
import { CycleReviewView } from "./CycleReviewView";

afterEach(() => vi.useRealTimers());
describe("cycle closing sync feedback", () => {
  it("explains the blocked queue next to the disabled closing action", () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const html = renderToStaticMarkup(<CycleReviewView data={createEmptyFinancialData()} actor="user" synced={false} pendingCount={30} blockedCount={1} syncMessage="Presupuesto: permission_denied" onRetrySync={async()=>{}} onCommit={async()=>{}}/>);
    expect(html).toContain("Cambios pendientes: 30");
    expect(html).toContain("Bloqueados en Presupuesto: 1");
    expect(html).toContain("Presupuesto: permission_denied");
    expect(html).toContain("Reintentar sincronización");
    expect(html).toContain('aria-describedby="closing-block-reasons" disabled=""');
  });
  it("explains future period blocking even when everything is synced", () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
    const html = renderToStaticMarkup(<CycleReviewView data={createEmptyFinancialData()} actor="user" synced={true} onCommit={async()=>{}}/>);
    expect(html).toContain("La quincena seleccionada termina el 2026-10-29");
    expect(html).not.toContain("El cierre está bloqueado hasta que Gastos");
  });
  it("allows closing an ended, synced quincena without a blocking notice", () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const html = renderToStaticMarkup(<CycleReviewView data={createEmptyFinancialData()} actor="user" synced={true} onCommit={async()=>{}}/>);
    expect(html).not.toContain('id="closing-block-reasons"');
    expect(html).toContain('class="button button-primary">Cerrar y reconciliar saldos');
  });
});
