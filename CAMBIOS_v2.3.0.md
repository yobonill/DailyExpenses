# Cambios · Daily Expenses 2.3.0

## Cierres quincenales y reconciliación

- El cierre deja de ser solo un snapshot informativo: al confirmar saldos reales, la app crea ajustes contables auditables fechados en el último día de la quincena.
- Los ajustes de cierre no cuentan como ingreso ni como gasto. Solo corrigen el ledger para que efectivo, cuentas bancarias y deuda de tarjeta partan del saldo real confirmado.
- Los movimientos registrados después del cierre no se reescriben ni se recrean; simplemente quedan calculados sobre la base reconciliada.
- Los préstamos se muestran en el cierre, pero no reciben ajustes automáticos de capital.
- Se conserva el valor calculado original y el valor reportado del cierre, junto con los IDs de los ajustes de reconciliación.
- La reconciliación de un cierre es idempotente: un cierre marcado como reconciliado no puede aplicarse de nuevo.
- Si el saldo calculado de una cuenta/tarjeta en la fecha del cierre ya cambió desde que se guardó, la reconciliación se bloquea para evitar duplicar o esconder una corrección retroactiva.

## Migración asistida del cierre ya existente

- 2.3.0 detecta cierres creados por versiones anteriores que guardaron `calculatedMinor` y `reportedMinor` diferentes, pero nunca incorporaron esa diferencia al ledger.
- La app muestra un aviso y una tarjeta en **Cierres quincenales** con la vista previa exacta de cada ajuste.
- El usuario confirma una sola vez con **Aplicar reconciliación del cierre**.
- No se vuelven a escribir manualmente los montos: se toman del cierre guardado.
- Para el backup evaluado del 2026-10-06, el cierre `2026-09_q1_v1` conserva todos los datos necesarios para esta operación.

## Ingresos recurrentes e historial

- Desactivar una fuente recurrente conserva todos los ingresos `received`, los cancelados y las filas históricas anteriores.
- Solo se eliminan las ocurrencias futuras que todavía estén en estado `expected`.
- Editar una fuente activa actualiza únicamente proyecciones futuras; no reescribe ingresos recibidos ni esperados históricos vencidos.
- Si una fuente se reactiva más adelante, `generationStartDate` evita regenerar meses que transcurrieron mientras estuvo inactiva.
- El fingerprint de cierres versión 2 usa `expectedDate` para ingresos pendientes; una proyección futura ya no dispara falsamente el mensaje de que se modificó una quincena cerrada.
- Los fingerprints históricos anteriores siguen siendo legibles; al reconciliar un cierre viejo se actualiza a fingerprint versión 2.

## UX

- El botón principal de cierre ahora es **Cerrar y reconciliar saldos**.
- Cada saldo muestra **Calculado**, **Saldo real** y **Diferencia / ajuste al confirmar**.
- El texto del cierre explica que los ajustes no son ingreso/gasto y que afectan balances posteriores.
- Los ajustes manuales siguen disponibles como herramienta de corrección explícita y ahora se distinguen de la reconciliación automática.
- Al desactivar un ingreso, la interfaz explica que el historial recibido se conserva y que solo se retiran proyecciones futuras esperadas.

## Compatibilidad

- Versión visible: **2.3.0**.
- `schemaVersion` continúa en **1**.
- No se requiere cambio de reglas Firebase para actualizar desde 2.2.x.
- No se requiere restaurar respaldo ni editar datos manualmente.
- El service worker usa caché **v16**.

## Pruebas agregadas

- Reconciliación de un cierre guardado con movimientos posteriores intactos.
- Reconciliación independiente de deuda de tarjeta DOP/USD.
- Bloqueo si el saldo histórico del cutoff ya no coincide con el snapshot guardado.
- Desactivación de ingresos sin tocar historial recibido/vencido.
- Ausencia de falso aviso de quincena cerrada por eliminar proyecciones futuras.
- Reactivación de ingreso sin resucitar meses omitidos mientras estuvo inactivo.
- Verificación opcional contra un backup real mediante `DAILY_EXPENSES_BACKUP`.
