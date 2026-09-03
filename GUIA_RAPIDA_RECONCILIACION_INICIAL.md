# Guía rápida — reconciliar el punto de inicio

Esta guía está adaptada al respaldo del 3 de septiembre de 2026. En ese respaldo:

- Las 25 obligaciones del mes financiero de agosto existen y todavía aparecen pendientes.
- Los cuatro ingresos de agosto ya están registrados como recibidos.
- La deuda DOP/USD de la tarjeta ya está registrada.
- Los tres pagos anteriores de tarjeta ya están identificados como históricos.
- Todavía no existe ningún pago vinculado desde Presupuesto.

Por eso no debes volver a crear facturas, ingresos, deuda ni pagos de tarjeta.

## Reconciliación recomendada

1. Actualiza la aplicación a la versión 1.5.0 y confirma que no tenga cambios pendientes de sincronización.
2. Abre **Presupuesto**.
3. En **Mes financiero**, selecciona **Agosto 2026**.
4. Selecciona **Mes**, no solamente Q2. Así podrás revisar las obligaciones de ambas quincenas.
5. Presiona **Reconciliar inicio**.
6. En **Seguimiento exacto desde**, usa el día al que corresponde la deuda actual que registraste. Para este respaldo, usa **3 de septiembre de 2026** si ese fue el balance que mostraba el banco ese día; si consultaste el saldo otro día, utiliza esa fecha exacta.
7. Comprueba los balances DOP y USD mostrados dentro de la ventana. Son informativos: la reconciliación no los modificará.

## Elegir el origen histórico

Tienes tres opciones:

- **No especificar:** recomendada si no quieres reconstruir cómo se pagó cada factura. Conserva los saldos y trata el gasto como anterior al seguimiento.
- **Tarjeta · ya incluido en la deuda registrada:** úsala para un grupo de facturas que sabes que forman parte del saldo inicial de la tarjeta. No generará cargos nuevos.
- **Efectivo, débito o transferencia · ya pagado:** úsala para facturas liquidadas antes del seguimiento fuera de la tarjeta. No generará una nueva salida de efectivo.

Si puedes separar fácilmente los grupos, realiza dos pasadas:

1. Reconciliación de las facturas pagadas con tarjeta.
2. Presiona después **Completar inicio** y reconcilia las pagadas fuera de la tarjeta.

Si hacerlo requiere investigar factura por factura, utiliza **No especificar** y completa una sola pasada.

## Seleccionar facturas

1. Presiona **Seleccionar todas**.
2. Desmarca las facturas que todavía no hayas pagado.
3. Revisa los montos. Cada factura utiliza inicialmente su monto esperado, pero puedes escribir el monto real si fue diferente.
4. No selecciones una obligación futura solamente porque ya fue creada automáticamente.
5. No selecciones **Ahorrar** salvo que realmente hayas separado ese dinero. La reconciliación marca la línea presupuestaria como completada, pero no crea un depósito en un fondo de ahorros.
6. Para servicios en USD que ya estén incluidos en la deuda USD registrada, puedes usar el origen histórico de tarjeta; la deuda USD no aumentará.

La sección de ingresos debe indicar que los cuatro ingresos ya fueron recibidos. No los selecciones ni los registres nuevamente.

## Confirmar

1. Marca la confirmación que indica que los movimientos ocurrieron antes del inicio del seguimiento.
2. Presiona **Guardar punto de inicio**.
3. Espera hasta que el indicador superior muestre que todo está sincronizado.

## Comprobación final

Después de reconciliar:

1. Las facturas seleccionadas deben aparecer como **Pagadas** y mostrar la etiqueta **Reconciliado**.
2. Las facturas no seleccionadas deben permanecer pendientes.
3. La deuda DOP y USD de la tarjeta debe ser exactamente la misma que antes.
4. Los tres pagos históricos de tarjeta deben permanecer en su historial.
5. El Dashboard mostrará una advertencia de **Período de transición** para agosto.
6. En **Más → Configuración**, debe aparecer la fecha desde la que comienza el seguimiento exacto.

## A partir de ese momento

- Usa **Pagar** para pagos nuevos realizados con efectivo, débito o transferencia.
- Usa **Pagar con tarjeta** únicamente para compras nuevas que deban aumentar la deuda.
- Registra los pagos nuevos de la tarjeta desde su propia sección para reducir la deuda.
- No vuelvas a reconciliar una factura que ya figure pagada.

Si seleccionas una factura equivocada, abre esa factura pagada y usa **Corregir / reabrir**. Esto elimina el registro histórico vinculado sin modificar la deuda; después puedes reconciliarla nuevamente o pagarla mediante el flujo normal.
