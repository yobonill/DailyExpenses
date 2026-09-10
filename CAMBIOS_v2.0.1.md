# Cambios · Daily Expenses 2.0.1

## Dashboard

- El primer indicador ahora muestra solamente el dinero real de las cuentas DOP seleccionadas por el usuario.
- La selección admite Efectivo y cuentas bancarias activas; de cada una se excluye cualquier ahorro apartado.
- El tercer indicador muestra el resultado esperado: dinero real seleccionado menos facturas todavía por cubrir y menos el pago de tarjeta todavía pendiente.
- Los pagos ya registrados no se descuentan por segunda vez.
- Los ingresos esperados no se suman al dinero que existe hoy.
- Un gasto no mensual ya cubierto con ahorros apartados no vuelve a descontarse del disponible diario.
- “Disponible para gastos diarios” usa la misma base real y muestra por separado el resultado y el faltante.

## Tarjeta

- Se retiraron del resumen las filas “Pago previsto DOP” y “Deuda USD prevista para pagar”.
- Se muestran límite y deuda registrada para DOP y USD.
- Se conservan los pagos mínimos, avisos, pagos ya realizados y la acción para definir o editar el pago previsto.

## Datos

- La selección se guarda en `settings.dashboardMoneyAccountIds` y se sincroniza entre dispositivos.
- No se modifican saldos, movimientos, ahorros, tarjetas, préstamos ni historiales.
- El esquema y el formato de respaldo permanecen en versión 1.
