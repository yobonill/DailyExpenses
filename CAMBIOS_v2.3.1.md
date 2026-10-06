# Daily Expenses v2.3.1

Hotfix para la reconciliación de cierres existentes introducida en v2.3.0.

## Corrección

- Permite que un `cycleClosing` existente avance exactamente una versión durante la reconciliación asistida.
- Mantiene control de concurrencia optimista: el primer dispositivo que reconcilia gana; un segundo intento con una versión obsoleta se rechaza.
- Corrige el conflicto falso que hacía que `Aplicar reconciliación del cierre` se descartara y apareciera en Diagnóstico como “Otro cambio se guardó primero…”.
- Añade una prueba de regresión para la transición de versión del cierre.

## Datos

No requiere cambios manuales ni restaurar backup. Los intentos fallidos de v2.3.0 se ejecutaron dentro de una transacción de Firebase y no dejaron ajustes parciales en el servidor.
