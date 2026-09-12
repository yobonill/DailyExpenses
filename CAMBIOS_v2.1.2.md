# Cambios · Daily Expenses 2.1.2

## Resumen del ciclo

- El bloque principal muestra **Total ingresado**, **Total gastado**, **Total ahorrado** y **Restante del ciclo**.
- La fórmula visible es: `Ingresado − Gastado − Ahorrado`.
- Un resultado positivo se presenta como **Restante** en verde; uno negativo como **Faltante** en rojo; cero usa un estado neutral.
- DOP y USD permanecen separados y nunca se convierten ni se suman entre sí.
- Al consultar un ciclo o quincena, los ingresos respetan el período financiero asignado. En un rango literal se usa la fecha real de recepción.
- Los filtros del detalle no cambian el resumen principal del ciclo.

## Desglose de gastos

- **Presupuesto**: obligaciones mensuales pagadas, incluyendo el pago completo de préstamos.
- **Extras**: todo lo registrado desde Registrar, además de cargos manuales o comisiones independientes.
- **No mensuales**: obligaciones ocasionales, trimestrales, anuales u otras recurrencias no mensuales.
- **Metas de compra**: compras completadas desde una meta.
- Los cuatro grupos suman exactamente **Total gastado**.
- Un segundo bloque explica cuánto se pagó por Banco, Efectivo, Tarjeta DOP, Tarjeta USD y cuánto queda por clasificar.
- El filtro Naturaleza y el bloque separado de deuda fueron eliminados; los préstamos aparecen dentro de Gastado y pueden localizarse por su categoría.

## Ahorros sin duplicación

- **Total ahorrado** incluye aportes nuevos a los fondos y ahorros históricos asociados al período.
- Saldos iniciales, correcciones y transferencias entre fondos no cuentan como ahorro nuevo.
- Al completar una obligación categorizada como **Ahorros**, la app solicita el fondo de destino y crea el aporte vinculado en la misma operación.
- El aporte reserva dinero dentro de la cuenta vinculada: reduce el disponible sin apartar, pero no reduce el saldo total de la cuenta.
- El pago de Presupuesto y el depósito vinculado producen un solo registro en Historial.

## Compatibilidad

- Esta versión se instala directamente sobre 2.1.1.
- No cambia el esquema de Firebase ni requiere publicar reglas nuevas.
- No ejecuta migraciones, reconciliaciones ni clasificación automática.
- La clasificación pendiente puede realizarse después de instalar 2.1.2.
- La versión visible es 2.1.2 y el caché PWA se renueva a `v13`.
