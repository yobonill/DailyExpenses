# Actualización a v2.3.1

1. Extrae el patch sobre la raíz del proyecto y reemplaza los archivos existentes.
2. Ejecuta `npm test`.
3. Ejecuta `npm run build`.
4. Despliega normalmente.
5. Abre `Revisar y cerrar quincena` y vuelve a pulsar `Aplicar reconciliación del cierre` una sola vez.
6. Verifica que el cierre quede marcado como conciliado y que ya no aparezca como reconciliación pendiente.

No uses “Reintentar sincronización” para los conflictos de v2.3.0: la cola ya está en cero y esos intentos fueron descartados de forma atómica.
