# Daily Expenses v2.5.0

## Gastos no mensuales: recurrencias flexibles

La pantalla **Gastos no mensuales** deja de limitar los planes a una sola vez / meses / años.

Nuevas frecuencias:

- Una sola vez.
- Cada X días.
- Cada X semanas.
- Días específicos de la semana.
- Cada X meses.
- Cada X años.

Los planes recurrentes pueden definir una **fecha límite inclusiva**. Cuando se usan días específicos, cada fecha del calendario se crea como una obligación independiente; por ejemplo, lunes a viernes durante tres semanas genera 15 sesiones separadas.

## Comportamiento de las ocurrencias

- Un pago de una sesión no mueve ni elimina las demás fechas del plan.
- Los planes con fecha límite se completan cuando se paga la última ocurrencia pendiente.
- Los planes diarios/semanales sin fecha límite mantienen una ventana móvil de 12 meses.
- Editar un calendario actualiza las ocurrencias futuras sin modificar pagos ya completados.
- Las ocurrencias postergadas se conservan como excepciones individuales al editar un plan activo.

## Compatibilidad

- Los planes existentes `once`, `months` y `years` siguen funcionando sin migración manual.
- El esquema de datos continúa en versión 1; los campos nuevos son opcionales.
- La versión visible de la aplicación pasa a `2.5.0`.
- La caché PWA pasa a `v19`.

## Firebase

Las reglas de Realtime Database deben actualizarse para aceptar `days`, `weeks` y `weekdays`, además de `recurrenceWeekdays` y `recurrenceEndDate`.
