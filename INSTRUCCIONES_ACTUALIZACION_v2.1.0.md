# Actualización a Daily Expenses 2.1.0

## Pasos

1. Descarga un respaldo JSON reciente y confirma que no haya cambios pendientes de sincronización.
2. Extrae el ZIP incremental sobre la raíz del repositorio y reemplaza los archivos incluidos.
3. Publica `firebase-database-rules.json` en Firebase Realtime Database.
4. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

5. Confirma los cambios y despliega mediante GitHub Pages.
6. Recarga completamente el primer dispositivo y confirma **Más → Configuración → Versión 2.1.0**.
7. Abre **Historial** y verifica el ciclo actual, los totales por medio, el comparativo y los filtros multiselección.
8. Cuando todo esté sincronizado, actualiza el segundo dispositivo.

No ejecutes reconciliaciones ni ajustes de saldo. Esta versión no requiere migración de datos.

## Archivos incluidos

- `CAMBIOS_v2.1.0.md`
- `DEPLOYMENT_CHECKLIST.md`
- `FIREBASE_RULES_UPDATE.md`
- `INSTRUCCIONES_ACTUALIZACION_v2.1.0.md`
- `README.md`
- `firebase-database-rules.json`
- `package-lock.json`
- `package.json`
- `public/sw.js`
- `src/components/ReviewView.tsx`
- `src/components/finance/CreditCardsView.tsx`
- `src/components/finance/SettingsView.tsx`
- `src/hooks/useFinanceActions.ts`
- `src/lib/spendingHistory.test.ts`
- `src/lib/spendingHistory.ts`
- `src/models/finance.ts`
- `src/styles.css`
