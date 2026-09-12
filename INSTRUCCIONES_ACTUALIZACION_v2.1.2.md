# Actualización de Daily Expenses 2.1.1 a 2.1.2

## Pasos

1. Espera a que ambos dispositivos indiquen cero cambios pendientes.
2. Descarga un respaldo JSON actualizado.
3. Pausa temporalmente el registro de movimientos.
4. Extrae el ZIP incremental sobre la raíz del repositorio y reemplaza los archivos incluidos.
5. Ejecuta:

   ```bash
   npm ci
   npm test
   npm run build
   ```

6. Revisa los cambios, crea el commit y despliega.
7. Actualiza primero un dispositivo y confirma **Más → Configuración → Versión 2.1.2**.
8. Revisa un ciclo y una quincena en Historial. Confirma que Presupuesto + Extras + No mensuales + Metas de compra sea igual a Total gastado.
9. Comprueba que Restante use `Ingresado − Gastado − Ahorrado` y cambie entre verde, rojo y neutral.
10. Completa la clasificación pendiente desde ese primer dispositivo.
11. Cuando termine la sincronización, actualiza el segundo dispositivo.

## Firebase y datos

- No publiques reglas nuevas: esta versión usa las reglas ya publicadas con 2.1.1.
- No hay migración de datos.
- No repitas la reconciliación de cuentas y ahorros.
- No necesitas clasificar antes de instalar esta actualización.

## Ahorros planificados

La próxima vez que pagues una obligación categorizada como **Ahorros**, deberás elegir el fondo de destino. La operación reservará el dinero dentro de la cuenta vinculada sin disminuir el saldo total físico y aparecerá una sola vez en Historial.

## Archivos incluidos

- `CAMBIOS_v2.1.2.md`
- `DEPLOYMENT_CHECKLIST.md`
- `INSTRUCCIONES_ACTUALIZACION_v2.1.2.md`
- `README.md`
- `package-lock.json`
- `package.json`
- `public/sw.js`
- `src/components/ReviewView.tsx`
- `src/components/finance/BudgetView.tsx`
- `src/components/finance/FutureExpensesView.tsx`
- `src/components/finance/SettingsView.tsx`
- `src/components/finance/Shared.tsx`
- `src/hooks/useFinanceActions.ts`
- `src/lib/financialIntegrity.ts`
- `src/lib/spendingHistory.test.ts`
- `src/lib/spendingHistory.ts`
- `src/styles.css`
