# Publicación de reglas de Firebase · 2.1.1

La versión 2.1.1 conserva el proyecto `app-daily-expenses-budget`, `/expenses` y `/dailyExpensesBudget/v1`.

Las reglas nuevas:

- aceptan los campos informativos usados para clasificar pagos históricos;
- exigen categoría y forma de pago en los gastos extras nuevos;
- exigen categoría en nuevas facturas, gastos no mensuales, metas y cargos de tarjeta;
- conservan compatibilidad con el respaldo generado el 12 de septiembre de 2026 a las 14:04:49 UTC.

El límite de compatibilidad está fijado en `2026-09-12T14:05:00.000Z`. No debe adelantarse porque bloquearía la restauración de los cinco gastos anteriores que todavía no tienen categoría.

## Publicar antes de desplegar

1. Deja de registrar movimientos temporalmente y conserva el respaldo JSON actual.
2. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
3. Ve a **Realtime Database → Rules**.
4. Guarda una copia de las reglas actuales.
5. Sustituye el contenido completo por `firebase-database-rules.json` incluido.
6. Pulsa **Publish**.
7. Despliega inmediatamente la aplicación 2.1.1.

No se agregan ramas ni se recalculan saldos. Clasificar pagos históricos solo agrega metadatos de reporte al mismo pago. No publiques estas reglas en TaskFollower.
