# Actualización a Daily Expenses 2.0.1

1. Conserva un respaldo JSON reciente y confirma que no haya cambios pendientes de sincronización.
2. Extrae el ZIP incremental sobre la raíz del repositorio y reemplaza los archivos incluidos.
3. Publica `firebase-database-rules.json` en Firebase Realtime Database.
4. Ejecuta `npm test` y `npm run build`.
5. Confirma los cambios y despliega mediante el flujo habitual de GitHub Pages.
6. Abre la app actualizada y confirma **Más → Configuración → Versión 2.0.1**.
7. En el Dashboard pulsa **Configurar cuentas** dentro del primer indicador.
8. Marca Efectivo, Popular · Nómina y la cuenta de ahorros DOP de Scotiabank. Si esta última todavía no existe en la app, créala primero en **Cuentas y productos** y luego vuelve a la selección.
9. Guarda la selección y verifica que ambos dispositivos muestren las mismas cuentas y el mismo total.

No ejecutes nuevamente la reconciliación de cuentas y ahorros. Esta actualización no requiere migrar ni ajustar balances.

## Archivos incluidos

- `CAMBIOS_v2.0.1.md`
- `DEPLOYMENT_CHECKLIST.md`
- `FIREBASE_RULES_UPDATE.md`
- `INSTRUCCIONES_ACTUALIZACION_v2.0.1.md`
- `README.md`
- `firebase-database-rules.json`
- `package-lock.json`
- `package.json`
- `public/sw.js`
- `src/App.tsx`
- `src/components/finance/DashboardView.tsx`
- `src/components/finance/SettingsView.tsx`
- `src/lib/financialCalculations.test.ts`
- `src/lib/financialCalculations.ts`
- `src/lib/moneyAndLoanLedger.test.ts`
- `src/lib/moneyLedger.ts`
- `src/models/finance.ts`
- `src/styles.css`
