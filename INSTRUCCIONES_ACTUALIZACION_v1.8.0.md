# Actualización a Daily Expenses 1.8.0

## Qué cambia

- **Ahorros, Tarjeta, Préstamos, bancos, cuentas y Efectivo** ahora se administran desde **Más → Cuentas y productos**.
- El resumen agrupa las cuentas y productos por banco.
- Los productos anteriores que todavía no tengan banco o cuenta aparecen en **Pendiente de organizar**; no se modifican ni se duplican.
- Solo puede existir una cuenta global de **Efectivo**.
- Un banco sin cuentas, tarjeta ni préstamos puede eliminarse desde su tarjeta.
- **Ingresos** permanece como sección independiente. Al marcar un ingreso DOP como recibido se elige la cuenta o Efectivo donde entró.

## Archivos que debes reemplazar o agregar

Extrae el ZIP en la raíz del repositorio y permite reemplazar los archivos existentes. El paquete contiene únicamente estos archivos:

```text
README.md
package.json
package-lock.json
src/App.tsx
src/styles.css
src/components/CaptureView.tsx
src/components/EditExpenseModal.tsx
src/components/finance/CreditCardsView.tsx
src/components/finance/FinancialHubView.tsx       (nuevo)
src/components/finance/LoansView.tsx
src/components/finance/MoneyView.tsx
src/components/finance/SettingsView.tsx
src/hooks/useFinanceActions.ts
src/lib/accountCenter.ts                           (nuevo)
src/lib/accountCenter.test.ts                      (nuevo)
INSTRUCCIONES_ACTUALIZACION_v1.8.0.md              (nuevo)
GUIA_RAPIDA_CUENTAS_Y_PRODUCTOS_v1.8.0.md          (nuevo)
CAMBIOS_v1.8.0.md                                  (nuevo)
```

No copies `node_modules` ni `dist`.

## Firebase y migración

- **No publiques reglas nuevas:** esta versión no cambia `firebase-database-rules.json`.
- **No ejecutes una migración:** se conservan el esquema 1, los IDs, balances, movimientos e historiales existentes.
- Los tres bancos ya creados seguirán visibles. Puedes reutilizarlos, editarlos o eliminar cada uno mientras continúe vacío.
- La tarjeta y los fondos de ahorro sin ubicación aparecerán en **Pendiente de organizar** hasta que los vincules manualmente.

Antes de actualizar, descarga un respaldo JSON desde **Más → Configuración**.

## Validar y publicar

Desde la raíz del repositorio:

```bash
npm ci
npm test
npm run build
```

Después:

```bash
git add .
git commit -m "feat: centralize accounts and financial products"
git push origin master
```

Cuando GitHub Pages termine el despliegue, abre la app y realiza una actualización forzada. En **Más → Configuración** debe mostrarse la versión `1.8.0`.

## Comprobación rápida

1. Abre **Más → Cuentas y productos**.
2. Confirma que se ve la tarjeta y los tres fondos de ahorro, aunque estén en **Pendiente de organizar**.
3. Confirma que sus balances e historiales siguen iguales.
4. Crea o abre una cuenta dentro de un banco.
5. Edita un fondo y selecciona dónde está guardado.
6. Edita la tarjeta y selecciona el banco emisor.
7. Marca un ingreso de prueba como recibido y confirma que pide la cuenta de destino.

