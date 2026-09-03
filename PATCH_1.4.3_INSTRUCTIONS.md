# Parche 1.4.3 — búsqueda, filtros y edición en Presupuesto

Este ZIP contiene únicamente los archivos modificados sobre la versión 1.4.2.

## Cambios incluidos

- Búsqueda de obligaciones por nombre, categoría o fila de Excel, sin distinguir mayúsculas ni acentos.
- Filtros combinables por categoría y estado: por pagar, vencidos, pagados y no aplican.
- Contador de resultados y opción para limpiar los filtros.
- Botón **Editar** junto a las acciones de cada obligación pendiente.
- La edición de un gasto de una sola vez modifica únicamente esa obligación.
- La edición de un gasto recurrente actualiza la plantilla y sus ocurrencias futuras pendientes.
- Confirmación más clara para **No aplica**: cancela solo la obligación del período y no desactiva la plantilla.

Los indicadores superiores continúan mostrando el total completo del período seleccionado; la búsqueda y los filtros afectan únicamente la lista.

## Instalación

1. Confirma que el proyecto instalado está en la versión 1.4.2.
2. Extrae este ZIP en la raíz del repositorio y permite reemplazar los archivos existentes.
3. Ejecuta:

   ```bash
   npm test
   npm run build
   ```

4. Publica los cambios mediante el flujo habitual de GitHub Pages.
5. Después del despliegue, realiza una recarga completa de la aplicación.

No se agregaron dependencias y no es necesario ejecutar `npm install` ni modificar las reglas de Firebase.
