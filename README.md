# Gastos Extras

PWA móvil para capturar gastos inesperados rápidamente desde cualquiera de los dos teléfonos y transferirlos luego a `Presupuesto 2026.xlsx` → `Detalles Gastos Extras`.

## Arquitectura

La aplicación reutiliza deliberadamente el mismo enfoque de TaskFollower:

- React + TypeScript + Vite
- GitHub Pages
- Firebase Realtime Database
- Firebase Email/Password Auth con las cuentas existentes de Yorki y Yisel
- Una sola colección compartida: `/expenses`
- `localStorage` como caché local y cola durable de operaciones pendientes
- Service worker + manifest para PWA/offline shell
- Sin servidor/backend propio
- Sin Firestore
- Sin IndexedDB

## Comportamiento offline

`localStorage` es el primer destino de cada cambio. Al guardar un gasto:

1. Se actualiza el estado local y la cola pendiente en una sola escritura local.
2. El formulario queda libre inmediatamente.
3. La sincronización con Realtime Database se intenta en segundo plano.
4. Si no hay conexión, el cambio permanece en la cola.
5. `.info/connected` detecta cuando Firebase vuelve a estar disponible y la cola se reproduce en orden.
6. Las actualizaciones remotas se combinan con las operaciones locales todavía pendientes para evitar que un snapshot remoto haga desaparecer un cambio sin sincronizar.

La primera autenticación en cada dispositivo sí requiere internet; después Firebase conserva la sesión localmente.

## Datos compartidos

Ambos usuarios existentes de TaskFollower leen y escriben exactamente el mismo nodo:

```text
/expenses
  /<expenseId>
```

No existe `/users/{uid}/expenses`, no hay gastos privados y el gasto no guarda quién lo registró.

## Modelo

Cada gasto contiene aproximadamente:

```text
id
name
unitPriceCents
quantity
occurredDate
occurredAt
status: pending | transferred
transferredAt?
createdAt
updatedAt
deletedAt?
```

`total`, `mes` y `quincena` se calculan; no se almacenan.

El dinero se guarda como centavos enteros (`995.50` → `99550`) para evitar errores de punto flotante.

## Quincenas

- Quincena 1: días 1–15
- Quincena 2: días 16–fin de mes

La regla está aislada en `src/lib/date.ts`.

## Flujo de captura

1. Abre directamente en **Registrar**.
2. Solo aparece `Nombre del gasto`.
3. Al escribir el nombre aparece `Precio unitario`.
4. Al introducir un precio válido aparece `Cantidad`, con valor inicial `1`.
5. Se muestra el total y `Guardar gasto`.
6. Tras guardar localmente, el formulario se limpia inmediatamente.
7. El borrador del formulario también se conserva localmente mientras no se haya guardado.

## Excel

La sección **Revisar** agrupa por mes y quincena.

`Copiar` genera dos columnas separadas por tabulación:

```text
Domino Pizza<TAB>995
```

Con cantidad mayor que uno:

```text
Coca Cola x3<TAB>450
```

`Copiar N` copia toda una quincena con filas separadas por salto de línea. Copiar no marca automáticamente los gastos como registrados. Después se puede usar `Marcar registrados`.

## Firebase existente

`src/config/firebaseConfig.ts` y `src/config/appUsers.ts` reutilizan la configuración y los dos UID del proyecto `app-taskfollower` suministrado como referencia. Las contraseñas **no** están en el código.

Antes de usar esta app con Firebase, publica las reglas incluidas en `firebase-database-rules.json`. Esas reglas conservan los nodos existentes de TaskFollower y añaden acceso compartido a `/expenses`.

Ver `FIREBASE_RULES_UPDATE.md`.

## Desarrollo

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` es el mismo patrón usado por TaskFollower y despliega en pushes a `master`.

En GitHub:

1. Crear/subir el repositorio.
2. Settings → Pages.
3. Source: **GitHub Actions**.
4. Hacer push a `master`.

`vite.config.ts` usa `base: "./"`, por lo que los assets funcionan bajo la ruta del repositorio de GitHub Pages.
