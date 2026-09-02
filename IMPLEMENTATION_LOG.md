# Registro de implementación · Release 1.3.0

## Resultado

Daily Expenses usa ahora un solo flujo para los gastos del momento. Registrar un gasto lo incorpora inmediatamente al sistema; ya no existe una cola de revisión ni un estado relacionado con Excel.

## Cambios principales

- `Registrar gasto` solicita forma de pago y categoría predefinida opcional.
- Efectivo, débito y transferencia se registran en DOP y reducen inmediatamente el disponible.
- Crédito permite DOP o USD y crea o actualiza automáticamente el cargo vinculado en la única tarjeta configurada.
- El gasto con tarjeta cuenta una sola vez como gasto realizado. El Dashboard descuenta efectivo únicamente cuando el pago de tarjeta se registra o se planifica.
- `Revisar` fue reemplazado por `Historial`, con filtros, edición y eliminación.
- Editar un gasto con tarjeta actualiza su cargo. Cambiarlo a otra forma de pago o eliminarlo revierte el cargo vinculado.
- Los registros antiguos se interpretan como gastos ya realizados; los que no tienen forma de pago se conservan como pagos en efectivo DOP.
- Reportes separa gastos extras por pago inmediato, tarjeta DOP y tarjeta USD, y los incluye en el resumen por categoría.
- La interfaz de exportación y todos los campos de mapeo de Excel fueron retirados.
- La aplicación limita la configuración normal a una sola tarjeta.

## Compatibilidad y datos

- Se conserva la rama Firebase `/expenses` y los identificadores existentes.
- No es necesario migrar ni volver a registrar gastos anteriores.
- Los campos nuevos son `paymentMethod`, `currency` y `category`.
- El respaldo JSON continúa incluyendo `/expenses` y `/dailyExpensesBudget/v1`.
- Las reglas Firebase deben publicarse porque ahora validan moneda y forma de pago en gastos nuevos.

## Verificación requerida

1. Publicar `firebase-database-rules.json`.
2. Ejecutar `npm ci`, `npm test` y `npm run build`.
3. Registrar gastos con débito, efectivo y transferencia y confirmar su impacto inmediato.
4. Registrar cargos DOP y USD con tarjeta y confirmar que la deuda aumenta sin descontar efectivo dos veces.
5. Editar y eliminar un gasto con tarjeta desde Historial.
6. Registrar o planificar un pago de tarjeta y confirmar que ese pago sí afecta el disponible del período.
7. Verificar sincronización entre las dos cuentas y funcionamiento sin conexión.

## Límites deliberados

- No se modela un balance bancario; el Dashboard presenta una proyección.
- No se almacenan números completos de tarjeta, CVV, PIN ni credenciales bancarias.
- No se convierte la deuda USD a DOP al crear el cargo. El pago conserva la deuda cancelada en USD y la salida real en DOP.
- Los avisos son internos; no existen notificaciones push ni procesos en segundo plano.
