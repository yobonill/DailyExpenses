# Lista de publicación · Daily Expenses 2.1.2

## Antes de actualizar

1. Confirma cero cambios pendientes en ambos dispositivos.
2. Descarga un respaldo JSON actualizado.
3. Pausa el registro de movimientos hasta finalizar la actualización.

## Publicación

1. Extrae el ZIP incremental sobre la versión 2.1.1.
2. No cambies las reglas de Firebase; 2.1.2 reutiliza las ya publicadas.
3. Ejecuta:

   ```bash
   npm ci
   npm test
   npm run build
   git status
   git diff --stat
   ```

4. Crea y publica el commit:

   ```bash
   git add .
   git commit -m "fix: clarify cycle summary and spending breakdown"
   git push origin master
   ```

5. Espera a que GitHub Actions finalice.
6. Actualiza el primer dispositivo y confirma la versión 2.1.2.
7. Verifica:
   - Ingresado − Gastado − Ahorrado = Restante.
   - Restante positivo en verde, faltante en rojo y cero neutral.
   - Presupuesto + Extras + No mensuales + Metas de compra = Total gastado.
   - Banco + Efectivo + Tarjeta + Por clasificar = Total gastado.
   - Un pago de préstamo aparece en Gastado, no en una sección independiente.
   - Registrar siempre produce un Extra.
8. Ejecuta la clasificación pendiente desde el primer dispositivo.
9. Después de sincronizar, actualiza el segundo dispositivo.

No ejecutes nuevamente la reconciliación de cuentas y ahorros.
