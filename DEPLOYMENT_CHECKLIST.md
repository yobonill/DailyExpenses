# Publicación · Daily Expenses 2.2.1

Sigue `INSTRUCCIONES_ACTUALIZACION_v2.2.1.md` para instalar sobre 2.2.0.

- No descartar ni duplicar el movimiento que quedó pendiente por el error de auditoría.
- Aplicar únicamente los archivos del ZIP incremental.
- Ejecutar `npm ci`, `npm test` y `npm run build`.
- Ejecutar `git status`, `git diff --stat` y `git diff --check`.
- **No cambiar/publicar reglas Firebase** para 2.2.1; conservar las reglas vigentes de 2.2.0.
- Publicar la app con el flujo habitual.
- Abrir primero el dispositivo con el pendiente y comprobar **Configuración → Versión 2.2.1**.
- Confirmar que el pendiente 2.2.0 se migra/sincroniza sin volver a registrar el pago.
- Confirmar que no se duplicaron balances, pagos ni deudas.
- Abrir una vez ambos dispositivos online para instalar service worker/cache v15.
- Probar arranque sin internet: debe aparecer **Continuar sin conexión** y cargar la copia local.
- Registrar un cambio offline, restaurar internet y confirmar sincronización automática en el otro dispositivo.
- Revisar Configuración → Diagnóstico de sincronización: colas en cero y ningún movimiento bloqueado.

Commit sugerido: `fix: harden financial sync and offline startup`.

No se modificó ni se desplegó Firebase durante la preparación de este paquete.
