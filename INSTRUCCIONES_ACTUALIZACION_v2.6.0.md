# v2.6.0 — Correcciones desde el historial de cuentas y productos

Extrae este ZIP directamente en la raíz del proyecto y reemplaza los archivos. Las rutas comienzan en `src/`, `public/` y los archivos de configuración: no hay carpeta contenedora adicional.

Ejecuta:

```bash
npm ci
npm test
npm run build
```

Despliega el contenido generado en `dist/` mediante tu proceso habitual. No se necesitan cambios en las reglas de Firebase para esta actualización. El service worker actualiza su caché; Configuración mostrará 2.6.0.

## Uso

Abre Historial de una cuenta, Historial banco, o Historial de una tarjeta/préstamo en Cuentas y productos.

- Selecciona fechas, moneda y, para un banco, la cuenta.
- Revisa el saldo inicial/final del rango y el saldo después de cada movimiento.
- Cuando hay una sola cuenta/moneda seleccionada, introduce opcionalmente el saldo final del banco para comparar la diferencia. Ese dato no cambia el saldo de la aplicación.
- Usa Agregar movimiento, Editar o Eliminar. Revisa los efectos y confirma.
- Al volver se conservan los filtros y la posición de la lista.
- El rango inicial corresponde al ciclo actual. Usa Todo el historial para consultar períodos anteriores.

Las quincenas cerradas son de solo lectura. Se comprueban la fecha original y la nueva, así como los movimientos vinculados, antes de guardar y otra vez al sincronizar. Un período que nunca se cerró sigue siendo editable; si su corrección afecta balances de cierres posteriores, se mantiene la advertencia de revisión existente.

## Operaciones vinculadas

Las transferencias corrigen ambos extremos y su comisión. Los pagos de tarjeta corrigen el retiro bancario y la deuda; el cashback reduce deuda sin crear un retiro. Los pagos de préstamo mantienen capital, intereses, cargos y la obligación vinculada. Para añadir un pago de préstamo puedes elegir una obligación pendiente existente o crear un pago adicional único.

Eliminar significa anular los efectos conservando auditoría; no borra permanentemente el registro. Eliminar un pago reabre su obligación; eliminar un ingreso recibido devuelve ese ingreso al estado pendiente.

Los ajustes se introducen como diferencias, no como saldos finales. Los ajustes de tarjeta/préstamo admiten diferencias positivas o negativas. Para cuenta bancaria se elige aumentar o reducir saldo.

## Validación

Pruebas automatizadas de operaciones vinculadas, monedas, ajustes, bloqueos de ciclos, sincronización y regresión. Compilación de producción verificada. No se completó una comprobación visual en navegador porque el entorno no pudo descargar Chromium. La advertencia existente de tamaño del bundle continúa siendo informativa.
