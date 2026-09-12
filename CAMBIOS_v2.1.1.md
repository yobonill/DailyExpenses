# Cambios · Daily Expenses 2.1.1

## Historial recuperado y más claro

- Los pagos reconciliados existentes vuelven a mostrarse en su mes financiero y quincena originales, aunque su fecha diaria exacta no estuviera disponible.
- El Historial separa **gastos de consumo**, **pagos de deuda** y **ahorros**. Los tres forman **Total destinado**, mientras “Gastado en consumo” excluye capital y ahorro.
- En préstamos, solamente intereses y cargos cuentan como gasto; la porción de capital se muestra como pago de deuda.
- Se agregó el filtro multiselección **Naturaleza** y la opción **Por clasificar** dentro de forma de pago.
- Los encabezados de cada quincena muestran por separado gasto, deuda y ahorro cuando corresponda.
- Los nuevos depósitos hechos desde un fondo de ahorro aparecen como “Ahorrado”; los saldos iniciales y transferencias entre fondos no se cuentan como ahorro nuevo del período.
- Los rangos de fecha literales excluyen pagos históricos sin fecha exacta y lo explican en pantalla; estos sí aparecen al consultar su ciclo o quincena original.

## Asistente de clasificación

- **Historial → Completar clasificación** permite indicar cómo se pagó cada registro histórico pendiente y, cuando corresponde, la cuenta o tarjeta.
- Esa clasificación histórica es exclusivamente informativa: no crea movimientos, no cambia cuentas y no modifica deudas.
- El mismo asistente detecta gastos extras anteriores sin categoría. Al corregir uno de estos extras, sí se actualiza su movimiento financiero vinculado si se cambia el método; la app lo advierte antes de guardar.

## Registros nuevos completos

- Categoría y forma de pago son obligatorias para cada gasto extra nuevo.
- La captura móvil ya no parte de “Efectivo” ni puede enviarse al confirmar la cantidad antes de mostrar y completar forma de pago y categoría.
- La categoría también es obligatoria en facturas mensuales, gastos no mensuales, metas de compra y cargos manuales de tarjeta.
- Las validaciones se aplican tanto en la interfaz como en las acciones de datos y las reglas de Firebase.
- Los registros del respaldo anterior a esta versión quedan preservados y pueden completarse gradualmente.

## Compatibilidad

- No cambia el esquema raíz (`/dailyExpensesBudget/v1`).
- No hay migración automática ni reconciliación de saldos.
- La versión visible de la aplicación es 2.1.1 y el caché PWA se renueva a `v12`.
