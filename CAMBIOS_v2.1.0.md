# Cambios · Daily Expenses 2.1.0

## Historial unificado

- El Historial ahora combina gastos extras, facturas mensuales pagadas, gastos no mensuales pagados, metas compradas, cargos manuales de tarjeta y comisiones bancarias.
- Cada gasto se cuenta una sola vez. Los movimientos de tarjeta o banco vinculados se usan para identificar el medio, pero no se duplican en el total.
- Se excluyen pagos de tarjeta, transferencias internas, movimientos de ahorros, reconciliaciones, pagos históricos y capital de préstamos.
- Los pagos de obligaciones USD realizados desde banco o efectivo usan la salida real registrada en DOP y conservan el importe USD como referencia.

## Resumen y comparación

- Indicadores para Total gastado, Dinero real, Banco, Efectivo, Tarjeta DOP y Tarjeta USD.
- Cada indicador compara el resultado contra el período inmediatamente anterior.
- Mes completo compara con el mes financiero anterior; una quincena compara con la quincena inmediatamente anterior.
- Un rango personalizado compara con el bloque anterior de igual duración.
- Los mismos filtros se aplican al período actual y al comparativo.

## Filtros

- Ciclo financiero o rango literal de fechas.
- Multiselección independiente por tipo, forma de pago, cuenta bancaria y categoría.
- Dentro de un grupo se pueden combinar varias opciones; entre grupos se aplican todas las condiciones.
- “Todos” restaura todas las opciones del grupo y nunca se permite una selección vacía accidental.
- Búsqueda por nombre o categoría, orden por fecha o importe y restauración global de filtros.

## Categorías

- Los cargos manuales registrados directamente desde Tarjeta ahora aceptan una categoría opcional.
- Los cargos anteriores sin categoría permanecen disponibles bajo “Sin categoría”.

## Compatibilidad

- No se migran ni modifican registros existentes.
- El esquema raíz y el formato del respaldo permanecen en versión 1.
