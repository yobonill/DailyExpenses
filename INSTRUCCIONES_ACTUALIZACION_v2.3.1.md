# Actualización a v2.3.1

1. Extrae el patch sobre la raíz del proyecto y reemplaza los archivos existentes.
2. Ejecuta `npm test`.
3. Ejecuta `npm run build`.
4. Despliega normalmente.
5. Abre la aplicación una vez con conexión para que el service worker `v17` prepare el shell actualizado.
6. Verifica en Configuración que la versión visible sea `2.3.1`.
7. En Dashboard, confirma que la tarjeta muestre Límite, Deuda registrada y Restante / disponible tanto en DOP como en USD.
8. Abre `Revisar y cerrar quincena` y vuelve a pulsar `Aplicar reconciliación del cierre` una sola vez.
9. Verifica que el cierre quede marcado como conciliado y que ya no aparezca como reconciliación pendiente.

No uses “Reintentar sincronización” para los conflictos de v2.3.0: la cola ya está en cero y esos intentos fueron descartados de forma atómica.
