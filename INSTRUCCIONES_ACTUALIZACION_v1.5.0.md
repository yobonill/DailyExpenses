# Instrucciones de actualización — Daily Expenses 1.5.0

Este paquete es un parche incremental para un proyecto que ya tiene instalada la versión 1.4.3.

## Antes de actualizar

1. En ambos dispositivos, abre la aplicación con conexión a Internet.
2. Confirma en **Más → Configuración → Diagnóstico de sincronización** que no existan cambios pendientes.
3. Descarga un respaldo desde **Más → Configuración → Respaldo compartido**.
4. Conserva la carpeta `.git` del repositorio.

## Instalar el parche

1. Extrae `APP-DailyExpenses-Patch-v1.5.0.zip`.
2. Copia su contenido en la raíz del repositorio de Daily Expenses.
3. Permite reemplazar los archivos existentes.
4. No copies ni publiques `node_modules` o `dist`.

No se agregaron dependencias. Si ya instalaste las dependencias de la versión 1.4.3, no necesitas ejecutar `npm install` ni `npm ci` nuevamente.

## Verificar localmente

Desde la carpeta que contiene `package.json`, ejecuta:

```bash
npm test
npm run build
```

Opcionalmente puedes iniciar el servidor local:

```bash
npm run dev
```

La dirección continúa siendo:

```text
http://localhost:42871
```

## Firebase

No debes modificar las reglas, Authentication ni la estructura manualmente. Los campos de reconciliación son compatibles con las reglas existentes y se crearán al usar la función.

## Publicar

```bash
git add .
git commit -m "feat: add starting-point financial reconciliation"
git push origin master
```

Si tu repositorio publica desde `main`, usa esa rama en lugar de `master`.

GitHub Actions ejecutará la instalación, las pruebas, la compilación y el despliegue. Después de que termine:

1. Abre la URL habitual de Daily Expenses.
2. Haz una recarga completa.
3. Cierra y vuelve a abrir la PWA si la tienes instalada.
4. Confirma en **Más → Configuración → Aplicación** que aparezca la versión `1.5.0`.
5. Confirma que la sincronización quede en cero pendientes antes de reconciliar.

## Archivos incluidos

El parche contiene únicamente los archivos modificados, estas instrucciones y la guía rápida. No contiene el respaldo financiero proporcionado para la validación.
