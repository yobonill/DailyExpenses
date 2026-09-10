# Lista de publicación · Daily Expenses 2.0.1

## Antes de actualizar

1. Descarga un respaldo JSON reciente.
2. Confirma que ambos canales de sincronización tengan cero cambios pendientes.
3. No vuelvas a ejecutar la reconciliación de cuentas y ahorros.

## Publicación

1. Extrae el ZIP incremental sobre la raíz del repositorio de Daily Expenses y reemplaza los archivos incluidos.
2. Conserva `.git`. No copies `node_modules`, `dist` ni `backups`.
3. Publica `firebase-database-rules.json` completo en **Firebase Console → Realtime Database → Rules**.
4. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

5. Confirma y sube:

   ```bash
   git add .
   git commit -m "fix: base dashboard projection on selected real balances"
   git push origin master
   ```

6. Espera a que GitHub Actions finalice.
7. Recarga por completo el primer dispositivo y confirma **Más → Configuración → Versión 2.0.1**.
8. En el Dashboard, pulsa el primer indicador y marca las cuentas que forman el dinero real para gastos diarios.
9. Para la configuración solicitada, marca **Efectivo**, **Popular · Nómina** y la cuenta **Scotiabank · Ahorros DOP**.
10. Espera a que la selección se sincronice; luego actualiza el segundo dispositivo.

## Verificación

- El primer indicador suma únicamente el disponible sin apartar de las cuentas marcadas.
- Las facturas pendientes no incluyen pagos ya registrados.
- El tercer indicador puede ser positivo o negativo y usa: dinero real seleccionado − facturas por cubrir − pago de tarjeta pendiente.
- “Disponible para gastos diarios” no suma ingresos futuros ni resta otra vez pagos realizados.
- La tarjeta muestra límite y deuda registrada para DOP y USD, además de los mínimos aplicables.

No hay scripts, migraciones ni ajustes manuales de saldos para esta versión.
