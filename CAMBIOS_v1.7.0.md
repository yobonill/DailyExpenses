# Archivos incluidos · Daily Expenses 1.7.0

Este ZIP contiene únicamente archivos nuevos o modificados respecto a la versión 1.6.0. Deben copiarse conservando sus rutas relativas.

## Cambios funcionales

- Bancos independientes y varias cuentas DOP por banco.
- Tipos de cuenta: corriente, ahorros, nómina, digital u otra.
- Saldo e historial separado por cuenta.
- Migración segura del saldo bancario general mediante distribución interna.
- Selección exacta de cuenta en ingresos, facturas, gastos extras, pagos de tarjeta y compras de metas.
- Efectivo se mantiene como origen separado.
- Comisión opcional de transferencia aplicada a la cuenta elegida.
- Tarjeta y préstamos vinculables a su banco.
- Fondo de ahorro vinculable opcionalmente a la cuenta donde se conserva físicamente.
- Dashboard muestra el total consolidado de bancos sin perder el detalle disponible en **Bancos y efectivo**.

## Datos preservados

El esquema continúa en versión 1. Los registros 1.6.0 se normalizan sin migración destructiva. El identificador anterior `bank` se conserva como **Saldo bancario por distribuir** y sus movimientos históricos permanecen intactos.

## Verificación incluida

- TypeScript sin errores.
- 50 pruebas automatizadas aprobadas.
- Build de producción aprobado.
- Puertos exclusivos confirmados: desarrollo `42871`, vista previa `42872`.
- JSON de reglas validado sintácticamente.
