# Publicación de reglas de Firebase · 2.5.0

La versión 2.5.0 amplía las recurrencias de **Gastos no mensuales**.

Las reglas incluidas en `firebase-database-rules.json` ahora aceptan:

- `recurrenceKind`: `once`, `days`, `weeks`, `weekdays`, `months`, `years`;
- `recurrenceWeekdays` cuando el plan usa días específicos de la semana;
- `recurrenceEndDate` opcional para planes con fecha límite.

Todas las validaciones previas de categorías, pagos y compatibilidad histórica se conservan.

## Publicar antes de desplegar 2.5.0

1. Conserva un respaldo JSON actual.
2. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
3. Ve a **Realtime Database → Rules**.
4. Guarda una copia de las reglas actuales.
5. Sustituye el contenido completo por `firebase-database-rules.json` incluido en v2.5.0.
6. Pulsa **Publish**.
7. Ejecuta las pruebas/build locales y despliega la aplicación 2.5.0.

Las reglas nuevas son compatibles con los planes antiguos y pueden publicarse antes que el frontend.
