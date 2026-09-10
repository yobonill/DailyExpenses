# Publicación de reglas de Firebase · 2.0.1

La versión 2.0.1 conserva el proyecto `app-daily-expenses-budget`, `/expenses` y `/dailyExpensesBudget/v1`.

La regla de `settings` ahora valida los elementos opcionales de `dashboardMoneyAccountIds`, donde se guarda la selección de efectivo y cuentas bancarias mostradas por el Dashboard. No se agregan ramas financieras ni se modifican balances.

## Publicar antes de desplegar la app

1. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
2. Ve a **Realtime Database → Rules**.
3. Guarda una copia de las reglas actuales.
4. Sustituye el documento completo por `firebase-database-rules.json` incluido en el parche.
5. Pulsa **Publish**.

Los UID autorizados no cambian. No publiques estas reglas en TaskFollower y no edites balances desde Firebase Console.
