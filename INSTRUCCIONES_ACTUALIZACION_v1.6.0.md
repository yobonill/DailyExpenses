# Actualización acumulativa a Daily Expenses 1.6.0

Este paquete actualiza una instalación 1.4.1 o posterior. Conserva los gastos, ingresos, facturas, deuda de tarjeta, ahorros y demás datos existentes.

## Antes de comenzar

1. En la app actual abre **Más → Configuración → Descargar respaldo JSON**.
2. Confirma que ambos teléfonos terminaron de sincronizar.
3. Guarda una copia de las reglas actuales de Realtime Database.

## Orden recomendado

1. Extrae el ZIP en la raíz del repositorio de Daily Expenses y permite reemplazar los archivos incluidos.
2. No borres `.git` y no copies `node_modules` ni `dist`.
3. Publica primero el contenido completo de `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**. Esta versión agrega validación para Banco, Efectivo, préstamos, comisiones y los nuevos métodos de pago.
4. En la carpeta que contiene `package.json`, ejecuta:

   ```bash
   npm test
   npm run build
   ```

   No necesitas ejecutar `npm install` si ya instalaste las dependencias de la versión anterior. No se agregaron paquetes nuevos. Para una instalación limpia puedes usar `npm ci`.

5. Publica en GitHub:

   ```bash
   git add .
   git commit -m "feat: track exact cash balances and loan payments"
   git push origin master
   ```

   Si tu repositorio usa `main`, sustituye `master` por `main` y confirma que el workflow observa esa rama.

6. Espera a que GitHub Actions finalice, abre la URL normal de la app y realiza una recarga forzada. No borres los datos del sitio ni desinstales la PWA antes de confirmar la sincronización.

## Primera apertura de 1.6.0

1. Abre **Más → Dinero disponible → Configurar saldos**.
2. Escribe cuánto tienes realmente ahora en Banco y Efectivo.
3. Usa como fecha inicial el día al que corresponden esos saldos.
4. Confirma que ya incluyen todos los ingresos y pagos anteriores. Así agosto no se aplicará otra vez.
5. Si tienes préstamos, abre **Más → Préstamos** y registra el capital pendiente exacto según el banco, la fecha del balance y la tasa anual.

## Verificación rápida

- Registra un ingreso DOP y confirma que aumenta Banco o Efectivo.
- Paga una factura por transferencia y confirma que baja Banco por el pago más la comisión elegida.
- Registra una compra con tarjeta y confirma que aumenta la deuda sin reducir Banco/Efectivo.
- Registra un pago de tarjeta y confirma que reduce tanto la deuda como la cuenta seleccionada.
- Vincula una factura de categoría **Deudas y préstamos** a un préstamo y confirma que solo el capital reduce su balance.
- Descarga un nuevo respaldo JSON.

Si Firebase muestra `PERMISSION_DENIED`, verifica que publicaste el archivo completo de reglas de este paquete y que estás en el proyecto `app-daily-expenses-budget`.
