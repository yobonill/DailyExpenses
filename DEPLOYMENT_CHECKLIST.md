# Lista de publicación · Daily Expenses 1.3.0

## 1. Firebase

1. Abre el proyecto `app-daily-expenses-budget`.
2. Confirma que **Authentication → Sign-in method → Email/Password** está habilitado.
3. Confirma estos usuarios en **Authentication → Users**:
   - `yorki@dailyexpenses.invalid` → `hmJi0g20svTPkfOF9ZzZwRi9Bdw2`
   - `yisel@dailyexpenses.invalid` → `YHtQh4N0RaViD8rXqDNE4xZTcN12`
4. Abre **Realtime Database → Rules**.
5. Copia todo el contenido de `firebase-database-rules.json`, publícalo y confirma que la consola no muestra errores.

La aplicación empieza con una base de datos vacía. No hay que crear nodos manualmente ni modificar TaskFollower.

## 2. Proyecto local

Extrae el ZIP y copia su contenido en la raíz del repositorio Daily Expenses. Conserva la carpeta `.git` existente y no copies `node_modules` ni `dist` al repositorio.

Con Node.js 20 o superior, ejecuta desde la carpeta que contiene `package.json`:

```bash
npm ci
npm test
npm run build
```

Para probar localmente:

```bash
npm run dev
```

La dirección local es `http://localhost:42871`. El comando falla si ese puerto ya está ocupado y no cambia silenciosamente a otro.

## 3. GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` escucha la rama `master`. Sube todos los archivos del proyecto:

```bash
git add .
git commit -m "Unify extra expense registration and card tracking"
git push origin master
```

En GitHub → **Actions**, confirma que `Deploy GitHub Pages` complete instalación, pruebas, build y publicación. No subas `dist`; el workflow lo genera.

## 4. Primera validación

1. Abre la URL publicada y realiza una recarga completa.
2. Inicia sesión como Yorki.
3. Registra un gasto extra pagado con débito y confirma que aparece inmediatamente en Historial, Dashboard y Reportes.
4. Abre otra sesión o dispositivo e inicia como Yisel.
5. Confirma que ambos registros aparecen y que un cambio realizado por Yisel se refleja para Yorki.
6. Prueba un registro sin conexión y comprueba su sincronización al reconectar.
7. Registra un gasto con tarjeta en DOP y otro en USD. Confirma que ambos aumentan la deuda correcta y no reducen el disponible hasta registrar o planificar el pago de la tarjeta.
8. Edita y elimina un gasto con tarjeta desde Historial y confirma que el cargo vinculado también se actualiza o revierte.
9. Genera un respaldo JSON y confirma que incluye gastos extras, tarjeta y módulos financieros.
10. Pausa `Repetir automáticamente cada mes` y confirma que el período actual y el historial permanecen, pero desaparecen las proyecciones futuras pendientes.

Si la PWA instalada continúa mostrando la versión anterior después de la publicación, ciérrala, abre la URL en el navegador y realiza una recarga completa. Reinstálala únicamente si el navegador conserva la identidad anterior.
