# Cambios · Daily Expenses 2.2.0

## Fecha del gasto

- Registrar muestra la fecha, inicialmente hoy según el dispositivo. Acepta fechas anteriores y rechaza futuras o inválidas.
- Categoría y forma de pago siguen siendo obligatorias. Enter avanza entre los campos del formulario; no omite las selecciones necesarias.
- La opción «Ya estaba incluido en el saldo inicial» permite reconstruir un extra anterior al punto de partida sin descontarlo de nuevo. Requiere una fecha compatible con el saldo inicial de su cuenta o tarjeta. No debe marcarse para un gasto omitido que sí debe afectar el balance.

## Revisar y cerrar quincena

- Acceso desde Más y Dashboard. Usa Q1/Q2 del calendario financiero existente, incluida la excepción de febrero.
- Compara saldo calculado y reportado al final de la quincena para efectivo, cada cuenta activa y deudas de tarjeta DOP/USD por separado.
- El banco se compara por saldo total, incluyendo dinero apartado; también se muestra el apartado y disponible. Un cierre tardío solicita los saldos de la fecha de cierre, no los actuales.
- Se puede cerrar desde el último día, con datos completos, diferencias o datos incompletos. No se reconstruyen balances anteriores a un saldo inicial cuando no hay evidencia suficiente.
- El cierre guarda una revisión nueva e inmutable. Una corrección anterior que cambie la base del cierre lo marca como «Requiere revisión»; también se revisan cierres posteriores afectados.
- Las diferencias muestran movimientos y aspectos que investigar: omisiones, duplicados, método, transferencias, comisiones y ahorros. La aplicación no asegura identificar automáticamente la causa.
- El saldo reportado no sustituye al calculado. Un ajuste requiere motivo y confirmación; no cuenta como ingreso ni gasto y queda auditado.

## Saldo insuficiente

- Para gastos, pagos y compras se permite confirmar un saldo negativo o un límite de tarjeta excedido: primero aviso, después confirmación explícita.
- La operación guarda una incidencia junto al movimiento. Las incidencias se consultan desde Dashboard, Cuentas y Cierres; resolverlas exige explicación. Un ingreso posterior no las resuelve automáticamente.
- El cálculo también busca déficits en fechas posteriores afectados por un gasto retroactivo.
- Las transferencias internas y nuevos apartados de ahorro siguen requiriendo fondos. No se permite pagar más deuda de la registrada ni dejar inconsistentes los vínculos o fondos de ahorro.

## Correcciones desde Historial

- Los extras conservan su edición directa. Los otros registros ofrecen «Ver y corregir en origen» y abren su movimiento vinculado.
- El editor permite corregir los datos aplicables al origen: fecha, importe, categoría, método, cuenta o tarjeta, fondo de ahorro, comisión, pago real en DOP de deuda USD, intereses y cargos del préstamo, y notas.
- Las monedas vinculadas a una obligación o meta se conservan para no cambiar silenciosamente su presupuesto. Las transferencias entre fondos se tratan como una operación vinculada, no como dos gastos editables independientes.
- Antes de guardar se presentan los efectos; se conserva el registro anterior mediante reversión y auditoría. Los pagos se reemplazan junto a sus movimientos dependientes, conservando ahorros y recalculando los saldos posteriores del préstamo.
- Corregir un pago no reprograma su recurrencia ni altera la siguiente obligación.
- Los pagos históricos clasificados actualizan el historial sin volver a afectar saldos actuales. La fecha exacta solo se muestra cuando fue informada.
- Al regresar de una corrección se conservan filtros y posición del historial.

## Filtros y etiquetas

- Con «Todos» activo, tocar «Alimentación» deja únicamente esa categoría. Tocar otra opción la añade; volver a tocarla la elimina.
- «Todos» restablece el grupo completo. Si se deselecciona la última opción quedan cero opciones y cero resultados; no vuelve silenciosamente a mostrar todo.
- El mismo comportamiento se aplica a los grupos de selección múltiple. No cambia la lógica de combinar diferentes grupos.
- Banco se presenta como «Pagado desde banco», con aclaración de débito y transferencias.

## Sincronización y compatibilidad

- Versión visible 2.2.0, caché PWA v14. Nuevas reglas de Realtime Database obligatorias.
- Extras nuevos/corregidos y sus efectos se guardan en el mismo espacio financiero y transacción. Los registros antiguos se combinan por ID, sin duplicación.
- Un control de versión detecta operaciones concurrentes preparadas sobre datos anteriores y rechaza el conjunto en vez de aplicarlo parcialmente. Hay que revisar el aviso de sincronización y volver a registrar la corrección sobre los datos actuales si otro dispositivo se adelantó.
- Los respaldos incluyen cierres, incidencias y auditoría. No se ejecuta una reclasificación, conciliación ni migración de saldos al iniciar.

## Verificación

- 90 pruebas automáticas aprobadas: cálculo de fechas, filtros, incidencias, cierres, operaciones atómicas, correcciones de extras, préstamos y pagos con ahorro; incluye compatibilidad con el respaldo del 15 de septiembre de 2026.
- Se comprobaron los 19 pagos históricos clasificados del respaldo sin modificar balances actuales y los 3 pagos reales activos sin cambiar sus recurrencias.
- TypeScript y compilación de producción aprobados. Vite conserva un aviso de tamaño del paquete JavaScript, que no impide compilar.
- No se pudo ejecutar la revisión visual automatizada: el entorno no dispone de navegador y falló su descarga. Las reglas no se ejecutaron en el emulador ni se publicaron en Firebase durante esta preparación. Debe verificarse la interfaz móvil y sincronización al actualizar.
