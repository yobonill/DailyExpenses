# Cambios · Daily Expenses 1.9.0

## Incluido desde 1.8.1

- Cuentas bancarias en DOP o USD sin mezclar monedas.
- Ubicación física opcional de cada fondo de ahorro en una cuenta de la misma moneda.
- Selección de cuenta DOP/USD al recibir ingresos.
- Totales separados por moneda y reglas Firebase compatibles.

## Nuevo en 1.9.0

- Acción **Postergar** disponible en Dashboard, Presupuesto y Gastos no mensuales.
- La nueva fecha debe ser posterior al vencimiento actual.
- Solo cambia la ocurrencia elegida; la plantilla y los demás meses no cambian.
- La fecha original, el mes financiero original y la quincena original se conservan para auditoría.
- Las proyecciones, reportes y exportación toman únicamente la nueva fecha/período.
- Editar o pausar una plantilla no borra ni devuelve a su fecha anterior una obligación postergada del período actual.
- El Dashboard divide visualmente las obligaciones del período seleccionado de los avisos externos.
- Caché PWA renovada para distribuir la interfaz actualizada.

No se agregaron dependencias ni se cambió el esquema raíz (`dailyExpensesBudget/v1`).
