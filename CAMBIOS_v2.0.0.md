# Cambios · Daily Expenses 2.0.0

## Cuentas y ahorros unificados

- El saldo de una cuenta ahora representa todo el dinero físico que existe en ella.
- Los fondos vinculados son porciones apartadas de ese mismo saldo y no se suman como dinero adicional.
- Cada cuenta muestra **Saldo total**, **Apartado en ahorros** y **Disponible sin apartar**.
- Los fondos muestran **Comprometido con gastos o metas** y **Disponible dentro del fondo**.
- Los fondos inactivos que conservan dinero continúan contando como ahorro apartado.

## Reconciliación segura

- Nuevo flujo explícito con captura de saldos reales, vista previa y confirmación final.
- La operación se guarda completa o no se guarda; no deja cuentas reconciliadas a medias.
- Un fondo nunca puede superar el saldo total de la cuenta donde está guardado.
- Los ajustes quedan registrados en el historial de dinero.
- Un resumen permanente impide ejecutar nuevamente la migración, incluso si dos dispositivos intentaran enviarla.
- Fondos, asignaciones, tarjetas, préstamos e historiales existentes permanecen intactos.

## Operación posterior

- Gastos, pagos y transferencias ordinarias usan solamente el disponible sin apartar.
- Apartar dinero en un fondo reduce el disponible sin cambiar el saldo total de la cuenta.
- Liberar dinero de un fondo aumenta el disponible sin cambiar el saldo total.
- Transferir ahorros entre fondos de cuentas diferentes mueve también el dinero físico entre esas cuentas.
- Ajustar una cuenta no permite dejar su saldo por debajo del ahorro apartado.

## Compatibilidad

- Se mantiene el esquema raíz `dailyExpensesBudget/v1` y el formato de respaldo 1.
- Se agrega únicamente el registro opcional `savingsAccountReconciliations`.
- No se agregaron dependencias.
- Caché PWA renovada.
