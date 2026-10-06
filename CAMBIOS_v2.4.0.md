# Daily Expenses v2.4.0

## Resumen

Esta versión añade acceso rápido a saldos e historiales por cuenta para facilitar la verificación manual contra las aplicaciones bancarias.

## Dashboard

- Nueva fila **Saldo actual según la aplicación**.
- Muestra las cuentas seleccionadas actualmente para el Dashboard de forma individual, usando su saldo total calculado por el ledger.
- Efectivo se muestra como una cuenta independiente.
- La tarjeta activa se muestra en dos tarjetas separadas: deuda DOP y deuda USD.
- Cada recuadro incluye **Ver historial** y abre directamente el historial correspondiente.
- La selección existente de cuentas del Dashboard sigue siendo la fuente de qué cuentas bancarias/efectivo aparecen; no se introducen IDs específicos del usuario en el código.

## Historial por cuenta y banco

- Efectivo ahora tiene acceso directo a **Historial**.
- Cada cuenta bancaria tiene acceso directo a **Historial**.
- Cada banco permite abrir un **Historial banco** agregado de todas sus cuentas.
- El historial muestra fecha, descripción, tipo, cuenta, entrada/salida y monto, sin inventar saldos históricos intermedios.
- La cabecera del historial muestra el saldo actual calculado por la aplicación.

## Historial de tarjeta

- El historial existente de tarjeta ahora puede filtrarse por **Todo / DOP / USD**.
- Los accesos del Dashboard abren directamente la tarjeta y la moneda correspondiente.

## Versión y PWA

- Versión visible: `2.4.0`.
- Se incrementa la caché del service worker para forzar la actualización del shell y assets.
- No requiere cambios en Firebase Rules ni migración de datos.
