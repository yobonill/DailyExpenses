# Publicación de reglas de Firebase

La aplicación usa el proyecto Firebase exclusivo:

```text
app-daily-expenses-budget
```

Los gastos diarios se guardan en:

```text
/expenses/{expenseId}
```

Los módulos financieros nuevos se guardan en:

```text
/dailyExpensesBudget/v1
```

## Usuarios autorizados

```text
Yorki · hmJi0g20svTPkfOF9ZzZwRi9Bdw2
Yisel · YHtQh4N0RaViD8rXqDNE4xZTcN12
```

Antes de publicar, confirma que estos UID todavía coinciden con **Authentication → Users** en `app-daily-expenses-budget`.

## Publicar

1. Abre `app-daily-expenses-budget` en Firebase Console.
2. Realtime Database → Rules.
3. Copia el contenido completo de `firebase-database-rules.json`.
4. Usa el simulador de reglas para probar:
   - lectura/escritura válida con cada UID aprobado;
   - rechazo sin autenticación y con otro UID;
   - rechazo de moneda, estado, tipo o forma inválidos;
   - aceptación de `plannedQuincena` con valor 1 o 2 y rechazo de cualquier otro valor.
5. Publica.

Las reglas niegan acceso por defecto y validan las entidades financieras críticas. La aplicación usa transacciones sobre `/dailyExpensesBudget/v1`, por lo que ese nodo necesita permisos de lectura y escritura para ambos UID.

No publiques estas reglas en el proyecto de TaskFollower. No hace falta crear manualmente nodos dentro de Realtime Database; la aplicación inicializa su estructura tras el primer acceso autenticado.
