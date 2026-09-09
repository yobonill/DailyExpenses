# Actualización a Daily Expenses 1.7.0

Esta versión reemplaza el único balance “Banco” por bancos y cuentas independientes sin borrar los datos existentes.

## Archivos y Firebase

El paquete es incremental: copia todos sus archivos sobre la versión 1.6.0. La actualización de `firebase-database-rules.json` es obligatoria antes de crear la primera cuenta nueva.

No hay dependencias nuevas, no cambia Firebase Authentication y no cambia la URL de GitHub Pages.

## Migración segura del saldo anterior

La app no intenta adivinar cómo dividir tu dinero. El balance anterior se conserva como **Saldo bancario por distribuir** y continúa incluido en el total disponible.

Mientras ese saldo sea mayor que cero:

- crea cada banco;
- crea sus cuentas con balance inicial cero;
- mueve desde **Saldo bancario por distribuir** hacia cada cuenta;
- no vuelvas a escribir como balance inicial un dinero que ya estaba incluido en el balance general.

El saldo anterior se desactiva automáticamente cuando llega a cero. Cada transferencia conserva trazabilidad y el total combinado no cambia.

Si no existe saldo bancario anterior, cada cuenta nueva puede comenzar directamente con su balance real.

## Compatibilidad

Los ingresos, pagos, gastos y movimientos ya registrados conservan su origen anterior. Los nuevos movimientos exigen una cuenta exacta. Al editar un movimiento antiguo pagado desde el banco general, selecciona primero una cuenta nueva.

Tarjetas y préstamos se vinculan al banco correspondiente. El origen de cada pago se elige por separado porque una tarjeta o préstamo puede pagarse desde una cuenta de otro banco.

