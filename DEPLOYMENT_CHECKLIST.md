# Lista de publicación · Daily Expenses 1.7.0

## Antes de actualizar

1. En la versión actual abre **Más → Configuración → Descargar respaldo JSON**.
2. Confirma que **Gastos diarios** y **Presupuesto y finanzas** muestran cero cambios pendientes.
3. Conserva una copia de las reglas actuales de Realtime Database.

## Publicación

1. Extrae el ZIP sobre la raíz del repositorio de Daily Expenses y reemplaza únicamente los archivos incluidos.
2. Conserva `.git`. No subas `node_modules` ni `dist`.
3. Publica primero el archivo completo `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
4. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

   No necesitas `npm install`: esta versión no agrega dependencias. En una copia limpia puedes usar `npm ci`.

5. Sube los cambios:

   ```bash
   git add .
   git commit -m "feat: add multiple banks and account-level balances"
   git push origin master
   ```

6. Espera a que GitHub Actions termine. Luego abre la URL habitual y realiza una recarga completa. No borres datos del sitio ni desinstales la PWA.

## Validación inicial

- La app debe indicar versión `1.7.0` en **Más → Configuración**.
- El saldo bancario general anterior debe aparecer intacto como **Saldo bancario por distribuir**.
- Un ingreso debe aumentar solamente la cuenta elegida.
- Un pago por transferencia o débito debe disminuir solamente la cuenta elegida.
- Una comisión debe disminuir esa misma cuenta como movimiento separado.
- Un pago con tarjeta debe aumentar deuda y no disminuir una cuenta bancaria hasta registrar el pago de la tarjeta.
- El total de todos los bancos más efectivo debe coincidir con tu dinero real.

