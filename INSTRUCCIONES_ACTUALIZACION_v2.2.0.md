# Actualización de 2.1.2 a 2.2.0

Este ZIP es incremental: contiene solo archivos nuevos o modificados. Extrae su contenido sobre la raíz de tu proyecto 2.1.2, conservando el resto. No incluye tus respaldos, configuración privada, dependencias ni `dist`.

1. Espera a que ambos dispositivos indiquen cero cambios pendientes y descarga un respaldo JSON. Pausa temporalmente los registros.
2. Reemplaza los archivos incluidos en el ZIP. Lee `CAMBIOS_v2.2.0.md`.
3. Ejecuta en el proyecto:

   ```bash
   npm ci
   npm test
   npm run build
   git status
   git diff --stat
   git diff --check
   ```

4. **Esta vez sí debes publicar reglas nuevas de Firebase.** En el proyecto de Daily Expenses abre Realtime Database → Reglas, copia `firebase-database-rules.json` completo y publica. No cambies las reglas de TaskFollower.
5. Crea el commit y publica mediante tu flujo habitual. Mensaje sugerido: `feat: add expense dates, fortnight closing and reviewed corrections`.
6. Recarga la aplicación y confirma **Más → Configuración → Versión 2.2.0 en ambos dispositivos**. No introduzcas registros desde una versión antigua. Si la PWA sigue mostrando la anterior, ciérrala y ábrela después de recargar la página del sitio.
7. Confirma que los balances y clasificaciones existentes siguen correctos y la sincronización termina sin errores. **No repitas la reconciliación de cuentas y ahorros ni reclasifiques registros ya completados.**
8. En Historial, con «Todos» activo toca Alimentación: solo esa categoría debe quedar seleccionada. Añade otra y luego pulsa Todos.
9. En el teléfono, comprueba que Registrar muestra fecha y exige categoría y forma de pago. Puedes preparar y cancelar el formulario sin guardar un gasto ficticio. Los gastos reales con insuficiencia mostrarán aviso y confirmación antes de registrarse.
10. Para el cierre, entra a Más → Revisar y cerrar quincena. Elige el período terminado y utiliza saldos correspondientes a su último día: efectivo, saldo total de cada banco y deuda DOP/USD de tarjeta. Deja vacío lo que no puedas confirmar. Revisa las diferencias antes de confirmar; el cierre por sí solo no modifica el dinero.

## Pruebas con un respaldo local

La suite normal es reproducible sin datos personales. Las tres pruebas adicionales de compatibilidad quedan omitidas si no se especifica un respaldo. Para ejecutarlas con el mismo respaldo usado durante la preparación:

```bash
DAILY_EXPENSES_BACKUP=/ruta/al/daily-expenses-backup-2026-09-15-11-52-45.json npm test
```

Estas pruebas leen el archivo local; no importan sus datos a Firebase. No agregues el respaldo al commit. Consulta las limitaciones de comprobación visual y Firebase en `CAMBIOS_v2.2.0.md`.

## Si aparece un error

- Si Firebase rechaza la escritura, revisa que las reglas nuevas estén publicadas y ambos dispositivos usen 2.2.0. No vuelvas a introducir el mismo gasto mientras figure pendiente de sincronización.
- Si otro dispositivo guardó primero y se informa un conflicto, revisa el historial compartido antes de repetir la operación.
- No bajes a 2.1.2 después de registrar movimientos con 2.2.0: la versión anterior no conoce los nuevos extras ni cierres. Conserva el respaldo previo para una recuperación deliberada; no restaures automáticamente sobre movimientos nuevos.
