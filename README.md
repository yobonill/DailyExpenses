# Gastos & Presupuesto

PWA compartida para Yorki y Yisel. Integra gastos extras, presupuesto mensual, Dashboard, ingresos, una tarjeta de crédito, bancos con múltiples cuentas, efectivo, préstamos, gastos no mensuales, metas de compra, ahorros, reportes y respaldo/restauración.

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

- **Registrar / Historial:** un solo flujo para gastos extras realizados. Se elige la forma de pago al registrar y el gasto queda contabilizado inmediatamente.
- **Dashboard:** obligaciones próximas, vencidas, estados de tarjeta, ingresos y proyección por moneda; separa claramente el período seleccionado de los avisos que quedan fuera de él.
- **Presupuesto:** gastos recurrentes y puntuales asignados explícitamente a Q1 o Q2, pago normal o con tarjeta, postergación individual, esperado/real y variación.
- **Ingresos:** salario, otros ingresos recurrentes y puntuales; esperado frente a recibido y cuenta DOP/USD donde entró.
- **Tarjeta:** una tarjeta, deuda DOP/USD independiente, cortes, vencimientos, cargos, pagos y ajustes.
- **Cuentas y productos:** un centro para bancos, cuentas DOP/USD, efectivo DOP, ahorros, la tarjeta y préstamos. Cada cuenta separa saldo total, ahorro apartado y disponible sin apartar.
- **Préstamos:** capital pendiente, tasa anual, historial de pagos y ajuste exacto contra el banco, administrados desde Cuentas y productos.
- **Gastos no mensuales:** una vez, cada N meses o cada N años, horizonte de 12 meses, alertas internas y postergación de un vencimiento sin mover el calendario recurrente.
- **Ahorros:** fondos por propósito que representan porciones apartadas dentro de una cuenta física de la misma moneda, con movimientos, transferencias y compromisos para gastos o metas.
- **Reportes:** gastos, flujo de caja, planificación, filtros de quincena/múltiples meses/año, desglose anual y resumen por categorías predefinidas.
- **Configuración:** umbrales del Dashboard, respaldo JSON, validación, restauración e instalación PWA.

## Calendario financiero

Un mes financiero comienza el día 15 y termina el día 14 del mes siguiente.

- Q1: día 15 hasta el día anterior al segundo pago.
- Q2: día 30 hasta el día 14 siguiente.
- Febrero: Q2 comienza en su último día real, 28 o 29.

La lógica canónica y sus pruebas están en `src/lib/date.ts` y `src/lib/date.test.ts`.

La fecha de vencimiento controla los avisos, pero un gasto de presupuesto puede asignarse manualmente a Q1 o Q2 para indicar de cuál quincena se planifica pagarlo. Esa asignación se conserva en el Dashboard, Presupuesto y Reportes, aunque la fecha caiga dentro del rango calendario de la otra quincena.

## Contabilidad esencial

- Un gasto extra se guarda como realizado desde el formulario; no tiene una etapa posterior de revisión.
- Efectivo reduce la cuenta Efectivo; débito y transferencia reducen exactamente la cuenta bancaria elegida. La comisión de transferencia se registra por separado en esa misma cuenta.
- Un gasto pagado con tarjeta cuenta como gasto una sola vez y crea deuda, pero no reduce el efectivo hasta registrar o planificar el pago de la tarjeta.
- Pagar la tarjeta reduce deuda y flujo de caja; no crea otro gasto.
- Un pago vinculado a un préstamo reduce su balance únicamente por la porción de capital; interés y cargos permanecen en el historial.
- Los saldos iniciales por cuenta, Efectivo y préstamos forman un punto de partida: los movimientos anteriores no se vuelven a aplicar.
- Los fondos de ahorro son porciones apartadas del saldo total de sus cuentas, no dinero adicional ni gastos.
- Una cuenta bancaria y un fondo vinculado siempre usan la misma moneda. Sus importes DOP y USD se muestran por separado y nunca se suman entre sí.
- Una asignación reserva saldo sin moverlo; consumirla genera el retiro correspondiente.
- Después de la reconciliación única, pagos, gastos y transferencias ordinarias solo pueden usar el disponible sin apartar. Consumir un ahorro vinculado libera su reserva dentro de la misma operación.
- Los pagos vinculados, cargos de tarjeta, retiros y cambios de estado se guardan juntos.
- Las transacciones financieras validan versiones, pagos duplicados y sobreasignación para uso simultáneo.

## Categorías y recurrencia

Las categorías son opcionales y se eligen de una lista predefinida. Agrupan gastos extras, obligaciones mensuales y gastos futuros en Reportes; no cambian fechas ni pagos.

`Repetir automáticamente cada mes` controla si una plantilla genera nuevos meses. Al pausarla se conserva la obligación del período financiero actual y todo el historial pagado/cancelado, pero se eliminan sus proyecciones futuras todavía pendientes. Al reactivarla se vuelven a generar los períodos futuros sin duplicados.

`Postergar` mueve solamente la obligación seleccionada a una fecha posterior. La app conserva su fecha original para auditoría, recalcula el mes financiero y la quincena de destino, y no cambia la plantilla ni los demás vencimientos. Si en el período de destino ya existe la factura recurrente normal, ambas obligaciones se muestran porque representan compromisos distintos.

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

La suite automatizada cubre fechas y febrero bisiesto, generación idempotente, separación DOP/USD, gastos extras por forma de pago, no doble conteo de tarjeta, integridad multiusuario, ahorros y respaldo. Los pasos manuales de despliegue y dispositivos están en `IMPLEMENTATION_LOG.md`.
