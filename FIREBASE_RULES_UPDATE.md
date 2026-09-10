# Publicación de reglas de Firebase · 1.9.0

La versión 1.9.0 sigue usando exclusivamente el proyecto `app-daily-expenses-budget` y conserva las rutas `/expenses` y `/dailyExpensesBudget/v1`.

Esta publicación única reemplaza la actualización 1.8.1: incluye cuentas bancarias y movimientos en DOP o USD, fondos vinculados a cuentas de su misma moneda y los campos de auditoría requeridos al postergar obligaciones. Efectivo y el saldo bancario heredado permanecen exclusivamente en DOP.

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
