# Lista de publicación · Daily Expenses 2.1.1

## Antes de actualizar

1. Conserva el respaldo `daily-expenses-backup-2026-09-12-14-04-49.json` o descarga uno más reciente si todavía no has registrado nada nuevo.
2. Pausa el registro de movimientos en ambos dispositivos.
3. Confirma que Gastos diarios y Finanzas indiquen cero cambios pendientes.
4. Conserva una copia de las reglas actuales de Realtime Database.

## Publicación

1. Extrae el ZIP incremental sobre la raíz del repositorio y reemplaza los archivos incluidos.
2. Publica primero `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
3. Ejecuta:

   ```bash
   npm ci
   npm test
   npm run build
   ```

4. Revisa los cambios y crea el commit:

   ```bash
   git status
   git diff --stat
   git add .
   git commit -m "fix: require spending classification and restore historical reporting"
   git push origin master
   ```

5. Espera a que GitHub Actions termine correctamente.
6. En el primer dispositivo, recarga completamente la PWA y confirma **Más → Configuración → Versión 2.1.1**.
7. Abre **Historial** y confirma que agosto Q1 muestre los pagos reconciliados.
8. Usa **Completar clasificación**. Verifica el resumen antes y después: clasificar un pago histórico no debe cambiar cuentas, tarjeta ni préstamos.
9. Registra un gasto de prueba y confirma que no pueda guardarse sin forma de pago ni categoría. Luego elimínalo si no deseas conservarlo.
10. Comprueba que consumo, pagos de deuda y ahorros aparezcan separados.
11. Cuando el primer dispositivo indique sincronización completa, actualiza y recarga el segundo.

No vuelvas a ejecutar la reconciliación de cuentas y ahorros. Esta actualización no requiere migración ni ajuste manual de saldos.
