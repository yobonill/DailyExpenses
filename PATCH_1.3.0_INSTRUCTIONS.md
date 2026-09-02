# Aplicar parche 1.3.0

Este ZIP contiene únicamente los archivos modificados. Extrae su contenido en la raíz del repositorio Daily Expenses y permite reemplazar los archivos existentes.

## Obligatorio

1. Publica el contenido completo de `firebase-database-rules.json` en **Firebase Console → Realtime Database → Rules**.
2. Ejecuta:

```bash
npm test
npm run build
```

No se agregaron dependencias. Si prefieres validar desde una instalación limpia, ejecuta `npm ci` antes de las pruebas.

3. Sube los cambios:

```bash
git add .
git commit -m "Unify extra expense registration and card tracking"
git push origin master
```

4. Después del despliegue, realiza una recarga completa de la PWA.

## Datos existentes

- No borres la base de datos ni el almacenamiento del navegador.
- Los gastos anteriores se conservan y se interpretan como gastos realizados.
- Un gasto anterior sin forma de pago se interpreta como efectivo en DOP.
- No es necesario crear nodos nuevos manualmente en Firebase.

## Prueba rápida

1. Registra un gasto con débito y confirma que reduce el disponible.
2. Registra un gasto DOP con tarjeta y confirma que aumenta la deuda sin reducir inmediatamente el disponible.
3. Registra un gasto USD con tarjeta y confirma que permanece en el balance USD.
4. Edita y elimina uno de esos gastos desde Historial y revisa que el cargo vinculado también cambie.
