# Actualización a Daily Expenses 2.1.1

## Orden seguro

1. Conserva el respaldo JSON actual y pausa transacciones en ambos dispositivos.
2. Extrae el ZIP incremental sobre la raíz del repositorio.
3. Publica `firebase-database-rules.json` en Firebase Realtime Database.
4. Ejecuta `npm ci`, `npm test` y `npm run build`.
5. Crea el commit y despliega mediante GitHub Pages.
6. Actualiza primero un solo dispositivo y confirma la versión 2.1.1.
7. Revisa agosto Q1/Q2 en Historial y completa gradualmente la clasificación pendiente.
8. Cuando termine la sincronización, actualiza el segundo dispositivo.

## Qué debes esperar

- Los pagos históricos aparecen en el ciclo y quincena donde se reconciliaron. Como no se guardó el día exacto, no aparecen en consultas de rango literal.
- **Total destinado** suma consumo, capital pagado de deuda y ahorro. **Gastado en consumo**, **Pagos de deuda** y **Ahorrado** explican ese total por separado.
- Los depósitos nuevos a fondos cuentan como ahorro del período; saldos iniciales y transferencias entre fondos no vuelven a sumarse.
- **Por clasificar** reúne gastos cuyo método histórico todavía se desconoce.
- Clasificar un pago histórico no cambia dinero ni deuda.
- Corregir la categoría o el método de un gasto extra existente usa la edición normal; si cambia el método, también corrige su movimiento financiero vinculado.
- Los gastos nuevos no pueden guardarse sin categoría y forma de pago.

No ingreses saldos manuales, no dupliques ahorros y no ejecutes nuevamente la reconciliación inicial.
