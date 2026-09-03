# Daily Expenses — parche 1.4.2

Este parche se aplica sobre la versión 1.4.1 y contiene solamente los archivos afectados por la corrección de Gastos diarios.

## Correcciones

- Las operaciones pendientes de creación y edición envían siempre el gasto completo a Firebase.
- Los gastos antiguos reciben automáticamente valores válidos para moneda, método de pago y estado.
- Las reglas de `/expenses` aceptan registros anteriores que todavía no contienen los campos nuevos, manteniendo el acceso limitado a Yorki y Yisel.
- **Configuración → Diagnóstico de sincronización** ahora permite descartar exclusivamente los cambios locales pendientes de Gastos diarios.
- Descartar pendientes restaura la lista recibida desde Firebase y no modifica presupuesto, ingresos, tarjeta, ahorros, sesión ni TaskFollower.

## Instalación

1. Extrae el contenido del ZIP en la raíz del repositorio Daily Expenses y reemplaza los archivos incluidos.
2. Publica el archivo completo `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
3. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

   No se añadieron dependencias; no necesitas ejecutar `npm install` si la versión 1.4.1 ya estaba instalada.

4. Confirma y publica:

   ```bash
   git add .
   git commit -m "fix: recover and discard pending expense sync changes"
   git push origin master
   ```

5. Después del despliegue, actualiza la PWA una vez y entra en **Más → Configuración → Diagnóstico de sincronización**.

## Qué hacer con los tres cambios pendientes actuales

Primero pulsa **Reintentar sincronización**. La nueva versión intentará recuperarlos enviando cada gasto completo.

Si no quieres conservarlos, pulsa **Descartar pendientes de Gastos diarios** y confirma. Esta acción elimina solamente esas operaciones locales. No utilices la opción general del navegador para borrar datos del sitio.

## Verificación

- 9 archivos de prueba aprobados.
- 39 pruebas aprobadas.
- Build de producción aprobado.
