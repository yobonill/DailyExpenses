import { describe, expect, it } from "vitest";
import { createEmptyFinancialData } from "../lib/financialState";
import { createBackup, validateBackupText } from "./backup";

describe("backup validation", () => {
  it("round-trips a versioned complete backup", () => {
    const backup = createBackup(createEmptyFinancialData(), []);
    const preview = validateBackupText(JSON.stringify(backup));
    expect(preview.valid).toBe(true);
    expect(preview.backup?.format).toBe("daily-expenses-budget-backup");
    expect(preview.counts).toMatchObject({ gastosDiarios: 0, gastosMensuales: 0, metasDeCompra: 0, tarjetas: 0, pagosDeTarjetaPlanificados: 0, cuentasDeDinero: 0, movimientosDeDinero: 0, prestamos: 0, movimientosDePrestamos: 0 });
  });

  it("rejects malformed and incompatible files", () => {
    expect(validateBackupText("not-json").valid).toBe(false);
    expect(validateBackupText(JSON.stringify({ format: "other", version: 99 })).valid).toBe(false);
  });
});
