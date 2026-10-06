# Actualización a v2.5.0

1. Conserva un backup JSON reciente de la aplicación.
2. Aplica el patch v2.5.0 sobre la raíz del proyecto.
3. **Antes de desplegar la aplicación**, publica `firebase-database-rules.json` en Firebase Console → Realtime Database → Rules.
4. Ejecuta:

```bash
npm test
npm run build
```

5. Si ambos pasan, despliega la aplicación.
6. Verifica en **Configuración** que la versión muestre `2.5.0`.
7. Prueba un gasto no mensual de ejemplo con **Días específicos de la semana** y una **Fecha límite**.

### Ejemplo: terapias por 3 semanas

- Repetición: `Días específicos de la semana`.
- Días: lunes, martes, miércoles, jueves y viernes.
- Cada cuántas semanas: `1`.
- Fecha inicial: primer día de terapia.
- Activar `Definir fecha límite` y seleccionar el último día del tratamiento.

El sistema generará una obligación independiente para cada sesión dentro del rango.

## Importante

Las reglas nuevas son retrocompatibles con los planes existentes. Es seguro publicar las reglas antes que el frontend.
