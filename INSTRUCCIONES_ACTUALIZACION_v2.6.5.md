# v2.6.5 — Historial separado de incidencias revisadas

Parche acumulativo desde v2.6.0. Extrae directamente en la raíz del proyecto y reemplaza los archivos.

```bash
npm ci
npm test
npm run build
```

Despliega `dist/` mediante tu proceso habitual. Configuración muestra 2.6.5. Sin cambios adicionales en reglas Firebase respecto a v2.6.3/v2.6.4 y sin migración de datos.

- La lista principal muestra únicamente incidencias pendientes, agrupadas por ciclo y quincena.
- Las incidencias revisadas se conservan en «Ver historial de incidencias revisadas», cerrado por defecto, con la misma agrupación y sus explicaciones guardadas.
- Un ciclo con todas sus incidencias revisadas desaparece de la lista principal y queda en el historial.
- Cuando ya no quedan pendientes, se indica expresamente; el historial sigue disponible.
- En el cierre se conserva el filtro de la quincena seleccionada para pendientes e historial.

Este cambio solo modifica la presentación. Conserva el comportamiento existente de revisión, saldos y cierres.

Verificación: listas mixtas, ciclos totalmente revisados, historial cerrado por defecto, pruebas de regresión y build de producción. Sin inspección visual en navegador.

Commit sugerido:

```text
feat: move reviewed balance issues into collapsed history
```
