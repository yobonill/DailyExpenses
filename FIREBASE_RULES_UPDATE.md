# Publicación de reglas de Firebase · 2.1.0

La versión 2.1.0 conserva el proyecto `app-daily-expenses-budget`, `/expenses` y `/dailyExpensesBudget/v1`.

La validación de `cardTransactions` admite ahora el campo opcional `category` para cargos manuales. Los registros anteriores siguen siendo válidos y aparecerán como “Sin categoría” hasta que se reemplacen por un cargo categorizado.

## Publicar antes de desplegar

1. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
2. Ve a **Realtime Database → Rules**.
3. Guarda una copia de las reglas actuales.
4. Sustituye el contenido completo por `firebase-database-rules.json` incluido.
5. Pulsa **Publish**.

No se agregan ramas, no se modifican saldos y no existe migración manual. No publiques estas reglas en TaskFollower.
