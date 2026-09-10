# Lista de publicación · Daily Expenses 2.0.0

## Antes de actualizar

1. No registres movimientos nuevos hasta terminar esta actualización.
2. Conserva el respaldo JSON más reciente incluido en `backups/`.
3. Confirma en la app actual que ambos canales de sincronización tengan cero cambios pendientes.
4. Guarda una copia de las reglas actuales de Realtime Database.

## Publicación

1. Extrae el ZIP incremental sobre la raíz del repositorio de Daily Expenses y reemplaza los archivos incluidos.
2. Conserva `.git`. No copies `node_modules`, `dist` ni la carpeta `backups` del paquete de trabajo.
3. Publica primero `firebase-database-rules.json` completo en **Firebase Console → Realtime Database → Rules**.
4. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

   No se agregaron dependencias. En una copia limpia puedes ejecutar `npm ci` antes de validar.

5. Confirma y sube:

   ```bash
   git add .
   git commit -m "feat: unify account balances and savings"
   git push origin master
   ```

6. Espera a que GitHub Actions finalice.
7. En el primer dispositivo abre la URL habitual, realiza una recarga completa y confirma **Más → Configuración → Versión 2.0.0**.

## Reconciliación única

1. Mantén cerrado o sin actualizar el segundo dispositivo.
2. En el primer dispositivo confirma que el estado superior diga **Todos los datos están sincronizados**.
3. Abre **Más → Cuentas y productos → Resumen**.
4. Pulsa **Reconciliar saldos**.
5. Para cada cuenta, escribe el saldo total real mostrado por el banco. No escribas únicamente la parte libre ni vuelvas a sumar los fondos.
6. Revisa la vista previa. El saldo total nunca puede ser menor que el ahorro apartado en esa cuenta.
7. Marca la confirmación y pulsa **Confirmar unificación** una sola vez.
8. Espera nuevamente a que la app muestre cero cambios pendientes.
9. Verifica por cuenta: **Saldo total = Apartado en ahorros + Disponible sin apartar**.
10. Descarga un nuevo respaldo JSON posterior a la reconciliación.
11. Ahora abre o actualiza la aplicación en el segundo dispositivo y confirma que muestra los mismos totales.

No hay scripts ni migraciones manuales de Firebase. La aplicación crea ajustes auditables únicamente por la diferencia entre el saldo registrado y el saldo total real confirmado.

## Valores que deben conservarse

- Los fondos y sus historiales no se recrean ni se duplican.
- Los balances iniciales y movimientos de la tarjeta permanecen intactos.
- El préstamo y su historial permanecen intactos.
- Los ingresos solo entran a una cuenta cuando se marcan como recibidos.
- Una compra con tarjeta aumenta la deuda; el banco disminuye solamente al pagar la tarjeta.
