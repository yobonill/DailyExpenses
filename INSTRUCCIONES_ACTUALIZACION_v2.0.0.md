# Actualización única · Daily Expenses 2.0.0

Consulta `DEPLOYMENT_CHECKLIST.md` y síguelo en orden. Los puntos críticos son:

1. Publicar primero `firebase-database-rules.json`.
2. Desplegar la aplicación y confirmar la versión 2.0.0.
3. Ejecutar **Reconciliar saldos** desde un solo dispositivo.
4. Introducir el saldo total real de cada cuenta, sin sumar nuevamente los fondos.
5. Esperar la sincronización, verificar la ecuación de cada cuenta y descargar un respaldo nuevo.
6. Actualizar el segundo dispositivo solamente después de esa verificación.

No modifiques balances, fondos, tarjetas o préstamos manualmente en Firebase. No existe un comando de migración de datos.

## Archivos que se reemplazan

- `DEPLOYMENT_CHECKLIST.md`
- `FIREBASE_RULES_UPDATE.md`
- `README.md`
- `firebase-database-rules.json`
- `package.json`
- `package-lock.json`
- `public/sw.js`
- `src/App.tsx`
- `src/components/CaptureView.tsx`
- `src/components/EditExpenseModal.tsx`
- `src/components/finance/CreditCardsView.tsx`
- `src/components/finance/DashboardView.tsx`
- `src/components/finance/FinancialHubView.tsx`
- `src/components/finance/MoneyView.tsx`
- `src/components/finance/SavingsView.tsx`
- `src/components/finance/SettingsView.tsx`
- `src/components/finance/Shared.tsx`
- `src/hooks/useFinanceActions.ts`
- `src/lib/financialIntegrity.ts`
- `src/lib/financialState.ts`
- `src/lib/moneyLedger.ts`
- `src/models/finance.ts`
- `src/services/backup.ts`
- `src/styles.css`

## Archivos nuevos

- `CAMBIOS_v2.0.0.md`
- `INSTRUCCIONES_ACTUALIZACION_v2.0.0.md`
- `src/components/finance/SavingsAccountReconciliationModal.tsx`
- `src/lib/savingsAccountReconciliation.ts`
- `src/lib/savingsAccountReconciliation.test.ts`
