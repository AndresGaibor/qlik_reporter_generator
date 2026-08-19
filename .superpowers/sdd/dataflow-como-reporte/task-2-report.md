# Reporte Task 2 — API `/reportes` y ejecución directa por Dataflow

## RED

- Se reemplazaron primero las pruebas focales para exigir catálogo Qlik, detalle, resumen, preflight, historial y POST por `flujoIdQlik`.
- La primera ejecución falló antes de cargar la suite porque la implementación todavía importaba contratos de reportes locales eliminados por Task 1 (`esquemaCrearReporte`).
- Tras eliminar esa API local, la RED mostró la dependencia faltante de consulta de flujos y verificó el cambio de comportamiento esperado.

## Archivos

- `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`: fachada Qlik para catálogo, detalle, resumen, preflight, historial y ejecución; eliminados handlers de configuración local.
- `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`: resolución del Dataflow actual por `qlik.listarFlujos()`, snapshots de nombre/espacio y auditoría con el puerto Task 1.
- `apps/api/src/app.ts`: inyección de `ConsultaFlujosQlik` en la fachada de reportes.
- Pruebas focales de rutas, ejecución y pipeline actualizadas a `flujoIdQlik`.
- `apps/api/src/app.test.ts`: cinco escenarios heredados de la API local quedaron `skip` porque pertenecen al contrato anterior y requieren migración de consumidores/Task 3.

## Tests

- `bun test apps/api/src/app.test.ts`: 9 pass, 5 skip, 0 fail.
- `bun test apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`: 8 pass, 0 fail.
- Biome sobre los 7 archivos modificados: pass.
- `git diff --check`: pass.
- `bun run --cwd apps/api typecheck`: sigue fallando únicamente en consumidores heredados de Task 1/3 (esquema persistencia, descargas, crear/clonar/sincronizar reporte e integraciones no migradas); no se agregaron shims ni se tocaron esos archivos prohibidos.

## Commit

- Creado: `da6e26f feat: ejecutar dataflows directamente como reportes`.

## Concerns

- Los cinco tests `app.test.ts` omitidos validan rutas de la API local anterior; deben migrarse o eliminarse coordinadamente con Task 3.
- El typecheck global queda bloqueado por consumidores Task 3/legado, conforme a la regla de trabajo.
