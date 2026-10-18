# v2.6.3 — Sincronización de comisiones y explicación de cierre bloqueado

Parche acumulativo desde v2.6.0. Extrae directamente en la raíz del proyecto y reemplaza los archivos.

## Recuperar los cambios pendientes

1. Conserva el respaldo que exportaste y los datos del navegador donde hiciste las correcciones.
2. En Firebase Console → Realtime Database → Reglas, publica el contenido completo de `firebase-database-rules.json` de este parche. Mantiene los mismos usuarios autorizados y permite una comisión igual a cero en los pagos por transferencia, para aceptar los cambios ya encolados por v2.6.2.
3. Compila y despliega la aplicación:

```bash
npm ci
npm test
npm run build
```

4. En el mismo navegador/perfil donde están los pendientes, abre la aplicación actualizada. Configuración debe mostrar 2.6.3.
5. En Más → Configuración, pulsa Reintentar sincronización. También puedes hacerlo desde Revisar y cerrar quincena.
6. Espera a que Gastos y Presupuesto estén sincronizados y los pendientes lleguen a cero. Si aparece otro bloqueo, conserva los pendientes y revisa el nuevo detalle antes de continuar.
7. Revisa los saldos y cierra septiembre · Quincena 2, cuyo corte es el 14 de octubre de 2026. Reporta los saldos de ese corte.

No descartes los pendientes, no borres los datos del navegador y no restaures otro respaldo como parte de esta actualización. La corrección permite reintentar los cambios existentes sin reconstruirlos ni modificar sus versiones. No publica las reglas ni modifica la base de datos automáticamente.

## Cambios

- Las reglas de pagos aceptan comisión cero para las operaciones existentes. Siguen validando tipo numérico, valor no negativo y método por transferencia.
- Las nuevas eliminaciones de comisión omiten el campo opcional del importe en pagos y pagos de tarjeta, igual que las demás operaciones sin comisión.
- El cierre muestra sus motivos de bloqueo junto al botón: fecha futura, operación en proceso o sincronización incompleta. Incluye número de pendientes y bloqueados, el mensaje de sincronización y un botón para reintentar.
- Se conserva la corrección que permite editar/eliminar una comisión sin anular el movimiento principal.

## Validación

Pruebas de la expresión real de validación de pagos, con el caso de comisión cero, campos omitidos y valores inválidos; regresiones de edición/eliminación independiente; renderizado del aviso de cierre; suite completa y compilación de producción. La comprobación local de expresiones no sustituye una prueba en Firebase: confirma el resultado del reintento en tu aplicación después de publicar las reglas. Sin verificación visual en navegador.

Commit sugerido:

```text
fix: unblock queued zero-fee payments and explain closing sync requirements
```
