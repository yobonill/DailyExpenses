# Cambios · Daily Expenses 2.2.1

## Corrección de auditoría y sincronización

- Corrige el fallo de Realtime Database que podía bloquear pagos y otros movimientos con el error `Data returned contains an invalid key (.../...)` dentro de `changeAudits.before` o `changeAudits.after`.
- Las rutas auditadas ya no se usan como nombres de propiedades Firebase. Ahora se guardan como valores `path` dentro de entradas de auditoría, por lo que rutas como `payments/<id>` son válidas.
- El visor de auditoría mantiene compatibilidad con el formato anterior.
- Las operaciones financieras pendientes creadas por 2.2.0 se migran localmente al formato seguro al iniciar. Un pago que quedó pendiente por este error no debe volver a registrarse ni descartarse antes de actualizar.
- Un error permanente de una operación financiera deja esa operación marcada como **Bloqueada** en vez de reintentarse indefinidamente. Los errores temporales de red siguen quedando pendientes para reintento.
- Configuración muestra la cola financiera actual, cantidad de bloqueados, detalle técnico del bloqueo, reintento manual y descarte deliberado después de disponer de una copia confirmada por Firebase.
- La antigua cola `/expenses` se identifica como cola heredada/compatibilidad y su descarte también se habilita únicamente después de cargar su copia remota.

## Inicio y trabajo sin conexión

- La pantalla inicial deja de depender indefinidamente de Firebase.
- Si el navegador detecta que no hay internet, se ofrece inmediatamente **Continuar sin conexión** cuando existe una sesión previa conocida y datos financieros locales.
- Si Firebase/Auth tarda en completar el inicio, la misma opción aparece después de aproximadamente 3 segundos aunque `navigator.onLine` indique conexión.
- Al entrar sin conexión se usa la última copia financiera almacenada en el dispositivo y los movimientos nuevos se guardan en la cola local.
- Un banner persistente indica que la sesión está en modo sin conexión.
- La aplicación no abandona el modo sin conexión solo porque el navegador indique que volvió la red. Espera a que Realtime Database confirme una conexión real mediante `.info/connected` y a que la sesión Firebase local siga correspondiendo a un usuario autorizado.
- Cuando Firebase vuelve a estar disponible, la app retorna automáticamente al modo normal y procesa la cola pendiente.
- Un dispositivo que nunca ha iniciado sesión/cargado datos no puede inventar una sesión offline; necesita una primera carga online.

## PWA / caché offline

- Caché del service worker actualizado de v14 a v15.
- Durante la instalación se analiza el `index.html` desplegado para guardar también los bundles JS/CSS con hash generados por Vite, además del shell, manifest, iconos y plantilla.
- Las navegaciones mantienen estrategia network-first con fallback al `index.html` cacheado.
- Los assets estáticos cacheados se sirven de inmediato y se refrescan en segundo plano cuando la red está disponible.

## Compatibilidad y datos

- Versión visible: **2.2.1**.
- `schemaVersion` continúa en **1**.
- No se cambian balances, cálculos contables, calendario financiero ni datos de Q1.
- No se requiere restaurar respaldo ni ejecutar una migración manual de Firebase.
- No hay cambios necesarios en `firebase-database-rules.json` para 2.2.1.
- La migración de una operación pendiente 2.2.0 ocurre únicamente en el estado local del dispositivo antes de reintentarla.

## Verificación realizada en este entorno

- `public/sw.js` pasó validación sintáctica con Node.
- Los archivos TypeScript/TSX modificados pasaron una validación de parseo/transpilación con TypeScript.
- Se agregó cobertura de regresión para convertir auditorías pendientes 2.2.0 con claves tipo `payments/<id>` a entradas Firebase-safe y comprobar que el contenido serializado no contenga claves inválidas.
- No fue posible ejecutar `npm ci`, `npm test` ni `npm run build` en este entorno porque la instalación de dependencias requiere acceso a npm y la red del contenedor no está disponible. Esas tres verificaciones son obligatorias antes de publicar.

## Corrección QA posterior
- Corrección QA: el test de auditoría ahora valida claves Firebase reales sin confundir los `path` almacenados como valores con claves inválidas.
