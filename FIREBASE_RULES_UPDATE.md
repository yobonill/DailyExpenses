# Publicación de reglas de Firebase · 1.7.0

La versión 1.7.0 sigue usando exclusivamente el proyecto `app-daily-expenses-budget` y conserva las rutas `/expenses` y `/dailyExpensesBudget/v1`.

Esta actualización de reglas es obligatoria: agrega bancos, permite múltiples cuentas bancarias, valida su estructura y permite que los movimientos de dinero señalen cualquier cuenta registrada. Las reglas anteriores solo aceptaban los identificadores generales `bank` y `cash`.

## Publicar

1. Abre Firebase Console y selecciona `app-daily-expenses-budget`.
2. Ve a **Realtime Database → Rules**.
3. Guarda una copia de las reglas actuales.
4. Sustituye todo por el contenido de `firebase-database-rules.json` incluido en este paquete.
5. Pulsa **Publish**.

Los UID autorizados siguen siendo:

```text
Yorki · hmJi0g20svTPkfOF9ZzZwRi9Bdw2
Yisel · YHtQh4N0RaViD8rXqDNE4xZTcN12
```

No publiques estas reglas en TaskFollower y no crees nodos manualmente. La aplicación crea bancos, cuentas y movimientos después del acceso autenticado.

