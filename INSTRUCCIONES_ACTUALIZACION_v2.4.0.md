# Actualización a v2.4.0

1. Haz un backup desde la aplicación antes de actualizar.
2. Extrae el ZIP del patch directamente sobre la raíz del proyecto y permite sobrescribir los archivos existentes.
3. Ejecuta:

```bash
npm test
npm run build
```

4. Si ambos terminan correctamente, despliega como de costumbre.
5. Después del despliegue, recarga la PWA/web para recibir la nueva caché.
6. Verifica en **Configuración** que la versión sea `2.4.0`.
7. En el Dashboard, confirma que la nueva fila muestre individualmente las cuentas seleccionadas, Efectivo y la deuda DOP/USD de la tarjeta activa.
8. Prueba **Ver historial** desde cada recuadro y confirma que abre la cuenta/moneda correcta.

No hay actualización de Firebase Rules ni migración de esquema para esta versión.
