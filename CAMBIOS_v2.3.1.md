# Daily Expenses v2.3.1

Hotfix acumulativo para v2.3.0.

## Correcciones

- Permite que un `cycleClosing` existente avance exactamente una versión durante la reconciliación asistida.
- Mantiene control de concurrencia optimista: el primer dispositivo que reconcilia gana; un segundo intento con una versión obsoleta se rechaza.
- Corrige el conflicto falso que hacía que `Aplicar reconciliación del cierre` se descartara y apareciera en Diagnóstico como “Otro cambio se guardó primero…”.
- Añade una prueba de regresión para la transición de versión del cierre.
- Corrige el número de versión visible en Configuración y en la tarjeta de reconciliación pendiente a `2.3.1`.
- El Dashboard de tarjeta ahora muestra, por separado para DOP y USD: límite, deuda registrada y restante/disponible (`límite - deuda`). Si no hay límite definido, el disponible se muestra como `No definido`.
- Incrementa la caché PWA a `v17` para forzar la actualización del shell y conservar correctamente la nueva versión para uso sin conexión.

## Datos

No requiere cambios manuales ni restaurar backup. Los intentos fallidos de v2.3.0 se ejecutaron dentro de una transacción de Firebase y no dejaron ajustes parciales en el servidor.
