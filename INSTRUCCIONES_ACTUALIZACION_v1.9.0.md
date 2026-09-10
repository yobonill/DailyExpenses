# Actualización única · Daily Expenses 1.9.0

Este parche está preparado para instalarse directamente sobre la versión 1.8.0. Incluye todos los cambios de 1.8.1, por lo que no debes instalar 1.8.1 por separado.

## Antes de actualizar

1. Abre la app actual en ambos dispositivos y confirma que no queden cambios pendientes.
2. Descarga un respaldo en **Más → Configuración → Descargar respaldo JSON**.
3. Guarda una copia de las reglas actuales de Realtime Database.

## Publicar una sola vez

1. Extrae el ZIP en la raíz del repositorio de Daily Expenses y reemplaza los archivos incluidos.
2. Conserva `.git`; no copies `node_modules` ni `dist`.
3. En Firebase Console abre **Realtime Database → Rules**.
4. Sustituye las reglas completas por `firebase-database-rules.json` del parche y pulsa **Publish**.
5. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

6. Confirma y sube:

   ```bash
   git add .
   git commit -m "feat: add bill postponement and dashboard cycle boundary"
   git push origin master
   ```

7. Espera a que GitHub Actions finalice, abre la URL habitual y realiza una recarga completa.
8. Confirma **Más → Configuración → Versión 1.9.0**.

No se agregaron dependencias. No necesitas ejecutar `npm install` si la versión 1.8.0 ya funcionaba localmente; usa `npm ci` únicamente en una copia limpia o si falta `node_modules`.

## Migración de datos

No hay que crear, eliminar ni mover nodos manualmente. Los datos existentes de facturas, ingresos, tarjeta, ahorros, bancos y cuentas se conservan. Los campos de postergación se crean solamente cuando utilizas la nueva acción.

La primera apertura conserva la migración compatible de 1.8.1 para cuentas DOP/USD y ubicación de ahorros. Por eso esta versión permite una sola actualización de código y una sola publicación de reglas desde 1.8.0.

## Prueba rápida

1. En **Presupuesto**, elige una factura pendiente y pulsa **Postergar**.
2. Selecciona una fecha de un período posterior.
3. Confirma que desaparezca del total pendiente del período original.
4. Abre el mes financiero de destino y confirma que aparezca con la etiqueta **Postergada** y su fecha original.
5. Revisa que la factura recurrente del mes siguiente permanezca en su fecha normal.
6. En el Dashboard, confirma que la línea **Fin del período seleccionado** separe lo incluido en el período de los próximos avisos externos.
