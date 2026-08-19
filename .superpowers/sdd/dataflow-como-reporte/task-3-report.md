# Task 3 — Reporte

## Status

Implementado el desacoplamiento de historial y descargas respecto del catálogo local de reportes.

## RED evidence

- Se adaptaron primero las pruebas de sincronización para usar el contrato de Task 1 (`listarEjecuciones(flujoIdQlik, tenantQlikId, organizacionId, limite)`) y eliminar `obtenerPorId`.
- La ejecución RED falló con `TypeError: this.repositorio.obtenerPorId is not a function`, demostrando la dependencia legacy antes del cambio.
- Se agregó una prueba HTTP para una ejecución histórica con snapshot `Ventas antiguas` y `auto-viejo`, verificando que se consulta el flujo histórico y el automate almacenado.

## Files changed

- `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts`: sincroniza por `(flujoIdQlik, tenantQlikId, organizacionId)` sin resolver reporte local; agrupa pendientes por `automatizacionIdQlik` del snapshot.
- `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts`: pruebas TDD ajustadas al contrato histórico.
- `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.ts`: elimina `reporteId`, expone `flujoIdQlik` y mapea `reporteNombre` desde `flujoNombreSnapshot`.
- `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts`: fixtures actualizados a snapshots de ejecución.
- `apps/api/src/modulos/descargas/http/rutas-descargas.ts`: sincronización de pendientes agrupada por flujo, no por catálogo local.
- `apps/api/src/modulos/descargas/http/rutas-descargas.test.ts`: cobertura de historial antiguo y privacidad HTTP existente.
- `packages/contratos/src/descargas/index.ts`: elimina `reporteId` y declara `flujoIdQlik`.

## Tests / commands

- PASS — `bun test apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts apps/api/src/modulos/descargas` (40 pass, 0 fail).
- PASS — `bun run --cwd packages/contratos typecheck`.
- PASS — Biome sobre los 7 archivos modificados.
- PASS — `git diff --check`.
- EXPECTED FAIL — `bun run --cwd apps/api typecheck`: permanecen consumidores de Task 2/legacy fuera del alcance, incluyendo `ejecutar-reporte.ts`, `rutas-reportes-dataflow.ts`, `clonar-reporte.ts`, `crear-reporte.ts` y `src/esquema.test.ts`.

## Commit

Pendiente de crear con el mensaje solicitado: `refactor: desacoplar historial y descargas del catalogo local`.

## Concerns

- El resumen de descargas conserva `flujoIdQlik` como dato técnico necesario para disparar sincronización sin consultar `reportes`; `reporteId` ya no se serializa ni se requiere.
- No se modificaron contratos de reportes, persistencia, repositorios, rutas de reportes, `EjecutarReporte` ni `app.ts`.
