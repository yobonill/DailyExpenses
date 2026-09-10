# Publicación de reglas de Firebase · 2.0.0

La versión 2.0.0 conserva el proyecto `app-daily-expenses-budget`, la ruta `/expenses` y el esquema `/dailyExpensesBudget/v1`.

La única ampliación es el nodo `/dailyExpensesBudget/v1/savingsAccountReconciliations`, utilizado para guardar el resumen auditable de la reconciliación y evitar que se ejecute dos veces. No se modifican los nodos ni los balances de tarjetas o préstamos.

## Publicar antes de desplegar la app

1. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
2. Ve a **Realtime Database → Rules**.
3. Guarda una copia de las reglas actuales.
4. Sustituye el documento completo por `firebase-database-rules.json` incluido en el parche.
5. Pulsa **Publish**.

Los UID autorizados no cambian:

```text
Yorki · hmJi0g20svTPkfOF9ZzZwRi9Bdw2
Yisel · YHtQh4N0RaViD8rXqDNE4xZTcN12
```

No publiques estas reglas en TaskFollower. No crees manualmente el nodo de reconciliación ni edites saldos desde Firebase Console.
