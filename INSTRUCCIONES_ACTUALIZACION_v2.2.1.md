# Actualización de 2.2.0 a 2.2.1

Este ZIP es incremental: contiene únicamente archivos nuevos o modificados. Extrae su contenido sobre la raíz del proyecto 2.2.0 y conserva el resto del repositorio.

## Antes de actualizar

1. **No descartes ni vuelvas a registrar el pago que ahora figura pendiente por el error de `changeAudits`.** 2.2.1 incluye una migración automática de esa operación local.
2. No es necesario restaurar de nuevo el respaldo de Q1. Los datos compartidos que ya quedaron correctos en Firebase se conservan.
3. Si el segundo dispositivo tiene cero pendientes, déjalo sin registrar movimientos hasta terminar la actualización del primer dispositivo.

## Aplicar y validar

1. Sustituye/agrega los archivos incluidos en el ZIP.
2. Ejecuta desde la raíz del proyecto:

   ```bash
   npm ci
   npm test
   npm run build
   git status
   git diff --stat
   git diff --check
   ```

3. **No publiques reglas Firebase nuevas para este parche.** Conserva las reglas 2.2.0 que ya están publicadas.
4. Publica la aplicación con tu flujo habitual.
5. Abre primero el dispositivo que contiene el pago pendiente. Confirma en **Más → Configuración** que aparece **Versión 2.2.1**.
6. La cola local 2.2.0 se migra al cargar. Si el pago no se sincroniza automáticamente, usa **Configuración → Diagnóstico de sincronización → Reintentar sincronización** una sola vez. No vuelvas a registrar el pago mientras continúe pendiente.
7. Confirma que el movimiento desaparece de pendientes y que los balances/deudas no se duplicaron.
8. Actualiza el segundo dispositivo y confirma también versión 2.2.1.

## Validar modo sin conexión

Después de haber abierto 2.2.1 al menos una vez con conexión en cada dispositivo:

1. Cierra la PWA.
2. Desactiva Wi-Fi/datos o usa una condición donde Firebase no pueda conectar.
3. Abre la PWA. Si Firebase no completa el arranque, debe aparecer **Continuar sin conexión** inmediatamente al detectar offline o aproximadamente a los 3 segundos.
4. Entra sin conexión y confirma que se muestran los últimos datos locales y el banner **Modo sin conexión**.
5. Registra un movimiento real o de prueba que luego puedas verificar. Debe quedar como pendiente local, sin bloquear la aplicación.
6. Restablece internet. La aplicación debe salir sola del modo sin conexión cuando Firebase confirme conexión y sincronizar la cola.
7. Verifica el movimiento en el segundo dispositivo y confirma que la cola vuelve a cero.

## Service worker / actualización PWA

El service worker cambia de caché v14 a v15 y ahora prepara explícitamente los bundles Vite para uso offline. Después del despliegue:

- abre/recarga la web una vez con internet para que el nuevo service worker se instale;
- si una PWA instalada conserva la versión anterior, ciérrala completamente y vuelve a abrirla después de cargar el sitio actualizado;
- no pruebes un arranque frío sin conexión hasta haber completado al menos una carga online de 2.2.1 en ese dispositivo.

## Si una operación queda Bloqueada

Configuración → Diagnóstico de sincronización mostrará el error técnico. **Bloqueada** significa que el fallo parece permanente (por ejemplo validación/payload), por lo que la app evita repetirlo infinitamente.

- Primero revisa/corrige la causa y usa **Reintentar sincronización**.
- Usa **Descartar pendientes de Presupuesto** solo si confirmas que quieres perder esos cambios locales. El botón solo se habilita después de que el dispositivo haya recibido una copia remota confirmada de Firebase durante esa sesión.
- No restaures un respaldo para resolver una operación bloqueada salvo que estés haciendo una recuperación deliberada de todos los datos compartidos.

## Commit sugerido

```bash
git add .
git commit -m "fix: harden financial sync and offline startup"
```
