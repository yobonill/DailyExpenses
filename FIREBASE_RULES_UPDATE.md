# Actualización de reglas de Firebase

Esta aplicación reutiliza el mismo proyecto Firebase de TaskFollower y guarda los gastos compartidos en:

`/expenses/{expenseId}`

El archivo `firebase-database-rules.json` incluido en este repositorio es una copia de las reglas actuales de TaskFollower **más** el nuevo nodo `expenses`. Por eso puede sustituir las reglas actuales sin eliminar el acceso de TaskFollower a `tasks`, `privateTasks`, `papipoints` o `taskTemplates`.

Los dos UID ya existentes (Yorki y Yisel) tienen lectura y escritura sobre el mismo nodo `/expenses`. Los gastos no se dividen por usuario y no guardan quién los creó.

## Aplicar

1. Firebase Console → Realtime Database → Rules.
2. Copiar el contenido de `firebase-database-rules.json`.
3. Publicar.

No hace falta crear otro proyecto Firebase, otra base de datos ni otros usuarios.
