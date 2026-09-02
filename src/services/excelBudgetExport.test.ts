import { readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Expense } from "../models/expense";
import { createEmptyFinancialData } from "../lib/financialState";
import { createBudgetWorkbookFromTemplate, validateExcelExport } from "./excelBudgetExport";

const metadata = {
  createdAt: "2026-01-15T12:00:00.000Z", createdBy: "u1",
  updatedAt: "2026-01-15T12:00:00.000Z", updatedBy: "u1", version: 1,
};

describe("Presupuesto workbook export", () => {
  it("writes hard-coded values into the original 2026 layout", async () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.internet = {
      id: "internet", name: "Internet", expectedAmountMinor: 150000, actualAmountMinor: 100000,
      currency: "DOP", dueDate: "2026-01-19", financialMonth: "2026-01", quincena: 1,
      status: "paid", canPayWithCard: true, oneTime: false, excelRowLabel: "Internet", ...metadata,
    };
    data.incomeOccurrences.salary = {
      id: "salary", name: "Nómina", incomeType: "salary", expectedAmountMinor: 200000,
      actualAmountMinor: 210000, currency: "DOP", expectedDate: "2026-01-15", receivedDate: "2026-01-15",
      financialMonth: "2026-01", quincena: 1, status: "received", oneTime: false,
      excelRowLabel: "Nomina yor", exportExpectedWhenPending: true, ...metadata,
    };
    const expenses: Expense[] = [{
      id: "daily", name: "Farmacia", unitPriceCents: 25000, quantity: 1,
      occurredDate: "2026-01-16", occurredAt: "2026-01-16T12:00:00.000Z", status: "transferred",
      createdAt: "2026-01-16T12:00:00.000Z", updatedAt: "2026-01-16T12:00:00.000Z",
    }];
    const template = await readFile(new URL("../../public/templates/Presupuesto-2026.xlsx", import.meta.url));
    const result = await createBudgetWorkbookFromTemplate(template, data, expenses, 2026);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await result.blob.arrayBuffer());
    const sheet = workbook.getWorksheet("2026");
    expect(sheet?.getCell("C19").value).toBe(500);
    expect(sheet?.getCell("D19").value).toBe(1000);
    expect(sheet?.getCell("I10").value).toBe(2100);
    expect(sheet?.getCell("M10").value).toBe("Farmacia");
    expect(sheet?.getCell("N10").value).toBe(250);
    expect(sheet?.getCell("N2").value).toBe(2100);
    expect(result.fileName).toBe("Presupuesto 2026.xlsx");
    if (process.env.WRITE_XLSX_VERIFICATION) {
      await writeFile(process.env.WRITE_XLSX_VERIFICATION, new Uint8Array(await result.blob.arrayBuffer()));
    }
  });

  it("blocks unsupported currency and missing row mappings before download", () => {
    const data = createEmptyFinancialData();
    data.monthlyOccurrences.usd = {
      id: "usd", name: "Servicio", expectedAmountMinor: 1000, currency: "USD",
      dueDate: "2026-01-18", financialMonth: "2026-01", quincena: 1,
      status: "upcoming", canPayWithCard: false, oneTime: true, ...metadata,
    };
    const validation = validateExcelExport(data, [], 2026);
    expect(validation.errors.some((error) => error.includes("solo admite DOP"))).toBe(true);
    expect(validation.errors.some((error) => error.includes("no tiene fila de Excel"))).toBe(true);
  });
});
