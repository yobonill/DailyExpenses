# Registro de implementación · Especificación v1.2 · Release 1.0.1

## Resultado

La implementación conserva Daily Expenses como PWA compartida y pantalla inicial. Release 1.0.1 conecta la aplicación al proyecto Firebase exclusivo `app-daily-expenses-budget`. No se creó APK, no se cambió el origen de GitHub Pages y no se modificó el código ni el backend de TaskFollower.

## Fases completadas

### Fase 0 · Base y PWA

- La fuente adjunta compiló antes de los cambios.
- Se preservaron Registrar, Revisar, estados pending/transferred, borrador local, edición, copiar, registrar, deshacer y eliminación lógica. (`DAY-001`–`DAY-014`)
- ID de manifest, caché y almacenamiento exclusivos; limpieza limitada a cachés Daily Expenses. (`PWA-001`–`PWA-004`, `REL-008`)
- Puertos estrictos 42871/42872. (`PWA-005`, `REL-009`)
- El origen, GitHub Pages y TaskFollower permanecen intactos. (`PWA-006`–`PWA-008`)

### Fase 1 · Datos y presupuesto

- Namespace Firebase versionado, metadatos, unidades menores, cola local y transacciones con control de versión/integridad. (`DAT-001`–`DAT-010`, `CALC-002`, `CALC-004`)
- Reglas exactas de mes financiero, Q1/Q2 y febrero. (`CAL-001`–`CAL-014`)
- Plantillas, generación idempotente, pagos, tarjeta, cancelación, reapertura e historial. (`MON-001`–`MON-018`)

### Fase 2 · Dashboard

- Período actual, obligaciones ordenadas, vencimientos, pagos rápidos, ingresos, estados de tarjeta, fondos y proyección DOP/USD. (`DSH-001`–`DSH-012`, `ACC-003`, `ACC-004`)

### Fase 3 · Ingresos

- Salario/otros, recurrentes/puntuales, fechas, generación idempotente, esperado/recibido y corrección. (`INC-001`–`INC-008`)

### Fase 4 · Tarjetas

- Varias tarjetas; apertura, límites opcionales, cortes/estados, deuda y pagos DOP/USD separados. (`CRD-001`–`CRD-020`)
- Cargo vinculado o manual, pago sin doble conteo, ajustes/reversiones y cobertura con ahorros. (`ACC-001`, `ACC-005`)

### Fase 5 · Gastos no mensuales

- Eventos únicos, cada N meses/años, horizonte de 12 meses, avisos internos y avance único. (`NME-001`–`NME-011`)

### Fase 6 · Ahorros

- Fondos por propósito, movimientos, transferencias, asignaciones, cobertura y prevención de sobreasignación. (`SAV-001`–`SAV-012`)
- Pago normal desde reservas y pago de tarjeta desde fondo se registran de forma vinculada.

### Fase 7 · Reportes y Excel

- Gastos, flujo de caja y planificación; filtros Q1/Q2, mes, varios meses y año; monedas separadas. (`RPT-001`–`RPT-008`)
- Exportación basada en la plantilla original, valores duros, validación y confirmación separada de gastos pendientes. (`XLS-001`–`XLS-011`)

### Fase 8 · Finalización

- Respaldo completo, validación, vista previa, confirmación escrita, respaldo de seguridad y restauración atómica. (`CFG-003`–`CFG-005`, `REL-004`)
- Reglas Firebase exclusivas para Daily Expenses, restringidas a los UID configurados de Yorki y Yisel. (`SEC-001`–`SEC-005`)
- Build de producción y suite automatizada completados. (`REL-001`–`REL-003`, `REL-007`)

## Evidencia automatizada

```text
npm test
7 archivos de prueba · 20 pruebas aprobadas

npm run build
TypeScript y Vite aprobados
```

La prueba del exportador carga la plantilla real, genera `Presupuesto 2026.xlsx`, vuelve a abrirlo con ExcelJS y compara celdas de presupuesto, pagos, ingresos, detalles y resumen anual.

Los servidores se iniciaron en 42871/42872 y se comprobó que `strictPort` rechaza una segunda instancia en 42871.

También se copió el proyecto a un directorio limpio sin `node_modules` ni `dist`, se ejecutaron `npm ci`, las 20 pruebas y el build. El Excel representativo se abrió y volvió a guardar con LibreOffice en modo headless; el XLSX resultante pasó la prueba de integridad ZIP/XML.

## Pasos manuales antes de producción

1. Publicar las reglas en `app-daily-expenses-budget` siguiendo `FIREBASE_RULES_UPDATE.md`.
2. Desplegar con el workflow GitHub Pages existente.
3. Iniciar sesión como Yorki y Yisel en dos sesiones, crear y pagar registros simultáneos y confirmar convergencia.
4. Probar desconexión, creación, reconexión y vaciado de la cola en ambos dispositivos.
5. Instalar/actualizar la PWA en escritorio y al menos un móvil.
6. Abrir un Excel representativo en Microsoft Excel para la última comprobación visual (la compatibilidad con LibreOffice ya fue validada automáticamente).
7. Comprobar coexistencia con TaskFollower. Los backends ya son independientes. Hasta que el service worker de TaskFollower sea corregido en aquel proyecto, una actualización de TaskFollower todavía puede borrar cachés Daily del mismo origen; nunca puede borrar los datos del Firebase independiente de Daily Expenses.

## Límites deliberados

- Los avisos son internos y se actualizan al abrir/enfocar la PWA; no hay push ni procesos en segundo plano. (`CFG-002`)
- La proyección no es un balance bancario porque no se modelan cuentas de efectivo/banco. (`ACC-004`)
- No hay importación automática del historial del Excel, integraciones bancarias, cambio de divisas ni usuarios adicionales.
- La hoja anual original no representa el detalle completo de tarjetas, asignaciones o gastos no mensuales; esos datos permanecen autoritativos en la aplicación. (`XLS-009`)
- TaskFollower debe recibir su corrección de service worker dentro de su propio proyecto; este paquete no contiene cambios de ese código. (`PWA-007`–`PWA-009`)
