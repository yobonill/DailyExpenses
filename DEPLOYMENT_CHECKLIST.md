# Lista de publicación · Daily Expenses 2.1.0

## Antes de actualizar

1. Descarga un respaldo JSON reciente.
2. Confirma que Gastos diarios y Finanzas tengan cero cambios pendientes.
3. Conserva una copia de las reglas actuales de Realtime Database.

## Publicación

1. Extrae el ZIP incremental sobre la raíz del repositorio y reemplaza sus 17 archivos.
2. Publica primero `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
3. Ejecuta `npm test` y `npm run build`.
4. Revisa `git status` y `git diff --stat`.
5. Agrega y confirma los cambios:

   ```bash
   git add .
   git commit -m "feat: add unified spending history and comparisons"
   git push origin master
   ```

6. Espera a que GitHub Actions termine.
7. Recarga completamente la PWA y confirma la versión 2.1.0.
8. Comprueba Historial en el ciclo actual y prueba una combinación de dos tipos, dos medios y dos categorías.
9. Verifica que una compra con tarjeta no vuelva a sumarse al registrar el pago de la tarjeta.
10. Actualiza el segundo dispositivo después de que el primero indique sincronización completa.

No hay scripts ni migraciones de datos. No vuelvas a ejecutar la reconciliación de cuentas y ahorros.
