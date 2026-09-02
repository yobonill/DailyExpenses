# Gastos & Presupuesto

PWA compartida para Yorki y Yisel. Conserva la captura rápida de gastos diarios y añade presupuesto mensual, Dashboard, ingresos, tarjetas, gastos no mensuales, ahorros, reportes, exportación Excel y respaldo/restauración.

## Arquitectura

- React 19 + TypeScript + Vite
- Proyecto Firebase exclusivo para Daily Expenses
- Firebase Email/Password Authentication con Yorki y Yisel
- Firebase Realtime Database exclusiva como fuente compartida de verdad
- GitHub Pages y PWA instalable
- Caché y cola local para trabajo durante interrupciones de conexión
- Operaciones financieras compuestas mediante transacciones de Firebase
- Importes almacenados en unidades menores enteras; DOP y USD nunca se convierten ni combinan
- Sin servidor propio, APK, Firestore, notificaciones push ni conexiones bancarias

Los gastos diarios viven en `/expenses`. Los módulos de presupuesto viven en el espacio versionado `/dailyExpensesBudget/v1`.

## Áreas funcionales

- **Registrar / Revisar:** flujo original de gastos inesperados, pendientes y registrados.
- **Dashboard:** obligaciones próximas, vencidas, estados de tarjeta, ingresos y proyección por moneda.
- **Presupuesto:** gastos recurrentes y puntuales asignados explícitamente a Q1 o Q2, pago normal o con tarjeta, esperado/real y variación.
- **Ingresos:** salario, otros ingresos recurrentes y puntuales; esperado frente a recibido.
- **Tarjetas:** varias tarjetas, DOP/USD independientes, cortes, vencimientos, estados, cargos, pagos y ajustes.
- **Gastos no mensuales:** una vez, cada N meses o cada N años, horizonte de 12 meses y alertas internas.
- **Ahorros:** fondos por propósito, depósitos, retiros, correcciones, transferencias y asignaciones.
- **Reportes:** gastos, flujo de caja, planificación, filtros de quincena/múltiples meses/año, desglose anual y resumen por categorías predefinidas.
- **Configuración:** umbrales del Dashboard, respaldo JSON, validación, restauración e instalación PWA.

## Calendario financiero

Un mes financiero comienza el día 15 y termina el día 14 del mes siguiente.

- Q1: día 15 hasta el día anterior al segundo pago.
- Q2: día 30 hasta el día 14 siguiente.
- Febrero: Q2 comienza en su último día real, 28 o 29.

La lógica canónica y sus pruebas están en `src/lib/date.ts` y `src/lib/date.test.ts`.

La fecha de vencimiento controla los avisos, pero un gasto de presupuesto puede asignarse manualmente a Q1 o Q2 para indicar de cuál quincena se planifica pagarlo. Esa asignación se conserva en el Dashboard, Presupuesto, Reportes y Excel, aunque la fecha caiga dentro del rango calendario de la otra quincena.

## Contabilidad esencial

- Un gasto pagado con tarjeta cuenta como gasto una sola vez y crea deuda.
- Pagar la tarjeta reduce deuda y flujo de caja; no crea otro gasto.
- Los fondos de ahorro son activos reservados, no gastos.
- Una asignación reserva saldo sin moverlo; consumirla genera el retiro correspondiente.
- Los pagos vinculados, cargos de tarjeta, retiros y cambios de estado se guardan juntos.
- Las transacciones financieras validan versiones, pagos duplicados y sobreasignación para uso simultáneo.

## Excel

`Reportes → Exportar a Excel` usa `public/templates/Presupuesto-2026.xlsx` y conserva el diseño de la hoja anual. Escribe valores numéricos y totales calculados sin depender de fórmulas. Al crear un gasto se puede elegir una fila existente o escribir el nombre de una fila nueva. La exportación utiliza cualquiera de los 13 espacios disponibles en el bloque de cada quincena y reutiliza una fila predefinida que no se necesite; si se requieren más de 13 filas únicas, avisa antes de generar el archivo.

Antes de descargar también bloquea:

- filas de presupuesto/ingreso sin mapeo;
- monedas no admitidas por la hoja original;
- bloques de detalle sin espacio;
- cualquier registro que no pueda representarse sin pérdida.

Los gastos diarios pendientes se incluyen, pero solo cambian a registrados tras una confirmación separada. El Excel es una presentación; el respaldo JSON es el formato de restauración.

## Categorías y recurrencia

Las categorías son opcionales y se eligen de una lista predefinida. Se usan únicamente para agrupar obligaciones mensuales y futuras en Reportes; no cambian sus fechas, pagos ni filas de Excel.

`Repetir automáticamente cada mes` controla si una plantilla genera nuevos meses. Al pausarla se conserva la obligación del período financiero actual y todo el historial pagado/cancelado, pero se eliminan sus proyecciones futuras todavía pendientes. Al reactivarla se vuelven a generar los períodos futuros sin duplicados.

## Firebase

Publica `firebase-database-rules.json` en el proyecto `app-daily-expenses-budget` antes de desplegar esta versión. Las reglas permiten acceso únicamente a las cuentas configuradas de Yorki y Yisel y solo contienen las ramas `/expenses` y `/dailyExpensesBudget/v1`. Consulta `FIREBASE_RULES_UPDATE.md`.

No guardes contraseñas, números completos de tarjeta, CVV, PIN ni credenciales bancarias en el código o la base de datos.

## Desarrollo

Requiere Node.js 20 o posterior.

```bash
npm ci
npm run dev
```

El servidor de desarrollo usa exclusivamente `http://localhost:42871`. La vista previa usa `42872`. Ambos tienen `strictPort: true`: si el puerto está ocupado, el comando falla y no toma otro puerto.

```bash
npm test
npm run build
npm run preview
```

## Despliegue

El workflow `.github/workflows/deploy-pages.yml` conserva el despliegue existente a GitHub Pages. `base: "./"` mantiene los assets bajo la ruta del repositorio.

Daily Expenses tiene ID de manifest, scope, caché y claves locales propias. Su service worker solo elimina cachés con el prefijo `daily-expenses-budget-shell-`. Su Firebase, usuarios, reglas y datos son completamente independientes de TaskFollower.

La secuencia exacta de primera publicación está en `DEPLOYMENT_CHECKLIST.md`.

## Respaldo y restauración

El respaldo JSON incluye gastos diarios y todas las entidades financieras versionadas. La restauración:

1. valida formato y versión;
2. muestra un resumen de contenido;
3. exige escribir `RESTAURAR`;
4. descarga un respaldo de seguridad actual;
5. reemplaza ambos árboles compartidos en una actualización atómica.

## Verificación

La suite automatizada cubre fechas y febrero bisiesto, generación idempotente, separación DOP/USD, no doble conteo, integridad multiusuario, ahorros, respaldo y exportación XLSX con comparación de celdas. Los pasos manuales de despliegue y dispositivos están en `IMPLEMENTATION_LOG.md`.
