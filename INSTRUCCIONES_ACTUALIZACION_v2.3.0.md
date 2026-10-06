# Actualización a Daily Expenses 2.3.0

## Antes de actualizar

1. Conserva un respaldo JSON reciente. El backup evaluado antes de esta versión fue `daily-expenses-backup-2026-10-06-12-01-37.json`.
2. Confirma que no haya operaciones bloqueadas en **Configuración → Diagnóstico de sincronización**.
3. Ejecuta las pruebas y el build local antes de publicar:

```bash
npm ci
npm test
npm run build
```

## Instalar el código

Copia/sobrescribe los archivos del parche 2.3.0 sobre el proyecto 2.2.1 y vuelve a ejecutar:

```bash
npm ci
npm test
npm run build
```

No hay cambios requeridos en `firebase-database-rules.json` para pasar de 2.2.x a 2.3.0. `schemaVersion` permanece en 1.

## Después de desplegar

1. Abre la app online y confirma en **Configuración** que aparece **Versión 2.3.0**.
2. Espera a que el estado indique **Sincronizado**.
3. Si aparece el aviso **Hay un cierre anterior con saldos reales pendientes de reconciliar**, pulsa **Revisar cierre**.
4. En **Cierres quincenales**, revisa la vista previa. Para el cierre legado solo se crean ajustes donde `calculado != reportado`.
5. Pulsa **Aplicar reconciliación del cierre** una sola vez.
6. Verifica que el cierre quede marcado con saldos incorporados al ledger y que ya no aparezca la tarjeta de migración.
7. Comprueba los saldos actuales de Efectivo y cuentas contra la realidad. Los movimientos posteriores al 29 de septiembre no deben haberse duplicado ni modificado.

## Desactivar el ingreso que terminó

Después de completar/validar la actualización:

1. Abre **Ingresos → Fuentes recurrentes**.
2. Edita la fuente que ya no recibirás.
3. Desmarca **Ingreso activo** y guarda.
4. Verifica que el último ingreso recibido siga en el historial.
5. Verifica que el siguiente ingreso futuro esperado haya desaparecido y que no se muestre advertencia de quincena cerrada por esa acción.

## Futuros cierres

Desde 2.3.0 no hay un paso manual adicional de ajuste después de cerrar. Introduce los saldos reales y pulsa **Cerrar y reconciliar saldos**. La app muestra la diferencia y crea los ajustes contables necesarios dentro de la misma operación.

Los préstamos no se ajustan desde esta pantalla; sus balances se corrigen desde **Préstamos** con el flujo específico de capital/interés/cargos.
