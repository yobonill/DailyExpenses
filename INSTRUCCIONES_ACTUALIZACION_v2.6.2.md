# v2.6.2 — Correcciones independientes de comisiones

Parche acumulativo: incluye v2.6.0, v2.6.1 y esta corrección. Extrae directamente en la raíz del proyecto y reemplaza los archivos.

```bash
npm ci
npm test
npm run build
```

Despliega `dist/` mediante tu proceso habitual. No requiere cambios en reglas Firebase ni migración de datos. Configuración muestra 2.6.2.

- Editar o eliminar una comisión afecta únicamente ese movimiento bancario. Conserva el estado, monto y fecha del pago, gasto, préstamo o transferencia principal.
- Se actualiza el importe de comisión guardado en el registro original. Una comisión eliminada no reaparece al editar posteriormente el pago o gasto.
- La confirmación de eliminación de una comisión indica expresamente que el movimiento principal se conserva.
- Eliminar el movimiento principal sigue anulando sus movimientos vinculados.
- Se mantienen las restricciones de ciclos abiertos.

Esta versión evita nuevas anulaciones incorrectas; no restaura automáticamente pagos ya anulados por la versión anterior. Puedes recuperar tu respaldo desde la aplicación y después rehacer las correcciones necesarias con esta versión instalada.

Verificación: pruebas de edición/eliminación independiente para pagos de obligaciones, préstamos, gastos, pagos de tarjeta y transferencias; suite de regresión y build de producción. Sin verificación visual en navegador.
