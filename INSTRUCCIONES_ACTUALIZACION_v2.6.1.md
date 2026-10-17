# v2.6.1 — Historial por ciclo y cuenta predeterminada

Este parche es acumulativo: incluye v2.6.0 y las correcciones de v2.6.1. Extrae directamente en la raíz del proyecto y reemplaza los archivos.

```bash
npm ci
npm test
npm run build
```

Despliega `dist/` mediante tu proceso habitual. No requiere cambios de reglas Firebase ni migración de datos. Configuración mostrará 2.6.1 y el service worker actualizará su caché.

## Ciclos

- Historial: selector de ciclo financiero (15 al 14), sin Desde/Hasta. Incluye ciclos cerrados para consulta.
- Agregar/editar movimiento: primero Ciclo, luego Fecha del movimiento, después sus detalles.
- El formulario muestra únicamente ciclos con fechas abiertas disponibles; excluye ciclos totalmente cerrados y futuros.
- La fecha queda limitada al ciclo elegido y a hoy. Cambiar de ciclo limpia una fecha que ya no pertenece a ese ciclo.
- Agregar desde el historial toma el ciclo que estás consultando. Para ciclos anteriores, debes elegir una fecha de ese ciclo.
- La aplicación cierra quincenas por separado: si solo una mitad está cerrada, el selector conserva el ciclo y permite únicamente las fechas de su mitad abierta.
- Se valida de nuevo al preparar y guardar. Si un ciclo se cierra mientras el formulario está abierto, el movimiento no se guarda en él.

## Cuentas

- Popular · Nómina aparece primero y es la cuenta predeterminada para nuevos formularios bancarios, cuando está activa y es compatible con la moneda.
- Alcanza queda al final y sigue disponible para selección manual.
- Las demás cuentas se pueden elegir normalmente. No se fuerza Popular después de una selección manual.
- Editar un movimiento conserva su cuenta guardada. Abrir el historial de una cuenta específica conserva ese contexto al agregar, y efectivo sigue siendo efectivo.
- El orden se comparte entre captura, pagos, ingresos, transferencias, ahorros y editores.

## Verificación

Pruebas de límites de ciclos, cierres parciales/completos, fechas futuras, orden de cuentas, moneda y conservación de selecciones existentes, además de la suite de regresión y el build de producción.

No se verificó visualmente en navegador: Chromium no estaba disponible en el entorno. Sigue presente la advertencia informativa del tamaño del bundle.
