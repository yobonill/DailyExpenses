# Publicación · Daily Expenses 2.3.0

- [ ] Tener un respaldo JSON reciente guardado fuera del navegador.
- [ ] Confirmar que la app 2.2.1 esté sincronizada y sin operaciones bloqueadas.
- [ ] `npm ci` completado.
- [ ] `npm test` completado sin fallos.
- [ ] `npm run build` completado sin fallos.
- [ ] No publicar cambios de reglas Firebase: 2.3.0 usa las reglas vigentes de 2.2.x.
- [ ] Desplegar `dist/` por el flujo habitual de GitHub Pages.
- [ ] Abrir primero un dispositivo online y confirmar **Configuración → Versión 2.3.0**.
- [ ] Confirmar actualización del service worker/caché v16.
- [ ] Esperar estado **Sincronizado** antes de reconciliar un cierre antiguo.
- [ ] Revisar la tarjeta **Actualización 2.3.0 · reconciliación pendiente**.
- [ ] Aplicar una sola vez la reconciliación del cierre legado y confirmar que desaparece la tarjeta.
- [ ] Comparar Efectivo, Popular, BHD, Scotia DOP/USD y tarjeta con los valores esperados después de la reconciliación.
- [ ] Confirmar que movimientos posteriores al cierre siguen existiendo una sola vez.
- [ ] Desactivar una fuente de ingreso de prueba/real y confirmar que lo recibido queda intacto y solo desaparecen proyecciones futuras.
- [ ] Abrir el segundo dispositivo online, dejar sincronizar y comprobar que no intenta reconciliar de nuevo el mismo cierre.
- [ ] Probar un cierre futuro con una diferencia pequeña verificable y confirmar que el ajuste se crea en el cutoff y no aparece como ingreso/gasto.
- [ ] Probar arranque offline y reconexión automática para verificar que 2.2.1 no sufrió regresión.
