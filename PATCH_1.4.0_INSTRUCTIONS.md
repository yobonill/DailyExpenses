# Daily Expenses 1.4.0 — seguimiento del pago mínimo

## Qué cambia

- Cada estado de tarjeta DOP o USD permite registrar el pago mínimo exacto indicado por Scotiabank.
- Los pagos de tarjeta registrados después del corte se descuentan automáticamente del mínimo.
- La aplicación muestra: sin registrar, pendiente, vence pronto, vence hoy, vencido, pagado a tiempo o pagado tarde.
- El Dashboard muestra el mínimo y cualquier faltante de forma explícita.
- La proyección usa el pago previsto o el mínimo pendiente, el que sea mayor; nunca descuenta automáticamente el balance completo de la tarjeta.
- El pago mínimo no se calcula como un porcentaje fijo. Debe copiarse del estado de cuenta del banco.

## Aplicación del parche

1. Copia el contenido de este parche en la raíz del repositorio y reemplaza los archivos indicados.
2. En Firebase Console abre **Realtime Database → Rules**.
3. Publica el contenido completo de `firebase-database-rules.json` incluido en el parche. Esta actualización es obligatoria porque permite guardar `minimumPaymentMinor` en los estados de tarjeta.
4. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

5. Confirma y publica:

   ```bash
   git add .
   git commit -m "feat: track credit card minimum payments"
   git push origin master
   ```

6. Después del despliegue, realiza una actualización forzada de la aplicación.

No es necesario ejecutar `npm install` si ya aplicaste la versión 1.3.0. El parche no cambia dependencias.

## Uso

1. Después de recibir el estado de cuenta, abre **Más → Tarjeta**.
2. En el estado DOP o USD correspondiente, pulsa **Registrar mínimo**.
3. Copia el monto exacto que muestra el banco.
4. Registra normalmente los pagos de tarjeta. La aplicación actualizará el cumplimiento del mínimo automáticamente.

Si el estado tiene mínimos separados en DOP y USD, registra cada uno en su moneda. Para un pago de deuda USD, sigue registrando cuánto USD se canceló y cuánto DOP salió realmente de tu cuenta.
