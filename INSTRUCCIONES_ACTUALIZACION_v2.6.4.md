# v2.6.4 — Incidencias explicadas y agrupadas por ciclo

Parche acumulativo desde v2.6.0. Extrae directamente en la raíz del proyecto y reemplaza los archivos.

```bash
npm ci
npm test
npm run build
```

Despliega `dist/` mediante tu proceso habitual. Configuración muestra 2.6.4. Si ya publicaste las reglas de v2.6.3, no necesitas cambiarlas otra vez; este parche incluye esa misma versión de las reglas.

## Incidencias

- En Revisar y cerrar quincena se muestran únicamente las incidencias de la quincena seleccionada. Se indica expresamente cuando no hay incidencias en ese período.
- En las demás vistas, las incidencias se agrupan por ciclo financiero y quincena, con sus fechas, pendientes y revisadas.
- La agrupación usa la fecha en que se detectó la insuficiencia o exceso de límite, no la fecha en que editaste ni necesariamente la fecha del gasto original. Por ejemplo, el 14 de octubre pertenece a septiembre · Q2; el 16 pertenece a octubre · Q1.
- Cada incidencia identifica cuenta/tarjeta y moneda, motivo, disponible calculado antes y después, faltante total y reducción del disponible causada por el cambio.
- Se explica la base del cálculo: saldo menos ahorros apartados en cuentas; límite menos deuda en tarjetas. No es una comparación con el saldo reportado al cierre ni un importe que debas volver a ajustar.
- Marcar como revisada requiere explicación, conserva el registro y no altera saldos ni movimientos.
- Son valores históricos guardados al detectar la incidencia. No se presentan como un problema necesariamente vigente ni se marcan automáticamente como revisados tras una corrección.

No cambia el registro de movimientos, el esquema de incidencias ni las reglas de cierre. No requiere migración. Conserva los datos y auditoría existentes.

Verificación: agrupación en límites de ciclo y quincena, separación de incidencias posteriores al corte, explicación de tarjetas y cuentas, comparación de disponible antes/después, estado vacío, suite completa y build de producción. Validación del marcado HTML mediante renderizado; sin inspección visual en navegador.

Commit sugerido:

```text
feat: group balance issues by cycle and explain before-and-after availability
```
