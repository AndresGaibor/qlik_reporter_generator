# Reporte Task 4 — Unificar Dataflows y Reportes

## Status

Implementación frontend completada en el worktree aislado. No se modificaron backend/API de producción, migraciones, contratos, descargas ni persistencia.

## Cambios

- `/reportes` usa exclusivamente el catálogo Qlik de `GET /reportes`: nombre, espacio y última actualización.
- Se eliminaron las acciones y conceptos locales de fila/detalle (`activa`, creador, clonar y edición) y no se ejecuta preflight por fila.
- Crear reporte reutiliza la modal de copia desde plantilla y apunta a `GET /reportes/plantilla-base` y `POST /reportes/desde-plantilla`, con apertura posterior en Qlik e invalidación del catálogo.
- El detalle carga en paralelo metadata, resumen, preflight e historial usando el ID Qlik, y conserva ejecutar/ver en Qlik Cloud.
- `/flujos` y `/flujos/:id` redirigen con `replace` a `/reportes` y `/reportes/:id`; se retiró Dataflows de la navegación.
- Se eliminaron las páginas/formularios locales de creación y configuración sin consumidores.

## RED evidence

- La prueba API actualizada falló antes de implementar los helpers nuevos (`obtenerDataflowBaseReporte`) y detectó la ruta legacy de preflight (`/reportes/dataflows/:id/preflight`).
- La prueba de filtrado falló con fixtures locales hasta migrarse a `espacioId`/`espacioNombre`, demostrando el cambio de catálogo.

## Verificación

- PASS — `bun run --cwd apps/web test:run -- src/modulos/reportes src/modulos/flujos src/app/navegacion.test.ts` (32 tests).
- PASS — `bunx biome check apps/web/src/modulos/reportes apps/web/src/modulos/flujos apps/web/src/app`.
- PASS — `git diff --check`.
- BLOCKED — `bun run --cwd apps/web typecheck`: solo quedan errores preexistentes en `apps/web/src/modulos/descargas/use-descarga-ejecucion.test.tsx`, por fixtures sin `flujoIdQlik`; ese ámbito está explícitamente fuera de esta tarea y no se modificó.

## Mismatch API pendiente

El backend presente en este commit expone la plantilla en `/flujos/plantilla-base` y `/flujos/desde-plantilla`, mientras el brief/interfaz de Task 4 exige `/reportes/plantilla-base` y `/reportes/desde-plantilla`. El frontend consume la interfaz canónica solicitada; la modal quedará bloqueada por 404 hasta que el API exponga esas rutas. No se editó backend por la restricción de alcance.

## Commit

Pendiente: `feat: unificar dataflows y reportes en la misma experiencia`.
