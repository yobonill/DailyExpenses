# Daily Expenses — parche 1.4.1

Este paquete contiene únicamente los archivos modificados desde la versión 1.4.0.

## Cambios incluidos

- Estado superior de sincronización compacto y pulsable, sin cortar información necesaria.
- Reintento conjunto de los flujos de Gastos diarios y Presupuesto/finanzas.
- Nueva sección **Configuración → Diagnóstico de sincronización** con:
  - estado y cantidad pendiente de cada flujo;
  - botón **Reintentar sincronización**;
  - registro local con fecha, origen, código y detalle técnico del error;
  - opción para limpiar solamente ese registro técnico.
- Reintento automático al recuperar internet o volver a abrir la aplicación.
- Normalización de gastos antiguos pendientes antes de enviarlos a Firebase.
- Nuevo modo para registrar un pago histórico de tarjeta que ya estaba reflejado en la deuda inicial:
  - cuenta para el pago mínimo, historial y reportes;
  - no vuelve a reducir la deuda actual;
  - no retira nuevamente dinero de un fondo de ahorros.
- Zoom por pellizco desactivado y escala móvil fijada en 100 %.

## Instalación

1. Cierra el servidor local de Daily Expenses si está ejecutándose.
2. Extrae este ZIP en la raíz del repositorio Daily Expenses y permite reemplazar los archivos incluidos.
3. No borres los datos del navegador, no desinstales la PWA y no limpies el almacenamiento del sitio. Los cambios locales pendientes se conservan.
4. Publica el archivo completo `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
5. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

   No se añadieron dependencias, por lo que no hace falta ejecutar `npm install` si ya instalaste la versión 1.4.0.

6. Confirma y publica:

   ```bash
   git add .
   git commit -m "fix: add sync diagnostics and historical card payments"
   git push origin master
   ```

7. Cuando termine GitHub Actions, abre la misma URL de siempre y actualiza una vez. Si hay cambios pendientes, entra en **Más → Configuración → Diagnóstico de sincronización** y pulsa **Reintentar sincronización**.

## Registrar un pago anterior sin duplicarlo

En **Tarjeta → Registrar pago**:

1. Escribe la fecha y el monto reales.
2. Marca **Este pago ya está incluido en la deuda actual** si configuraste la deuda actual después de haber realizado ese pago.
3. Registra el movimiento.

El pago aparecerá en el historial y podrá cubrir el mínimo del estado correspondiente, pero el balance actual no se reducirá otra vez.

## Verificación realizada

- 8 archivos de prueba aprobados.
- 37 pruebas aprobadas.
- Compilación TypeScript y build Vite de producción aprobados.
