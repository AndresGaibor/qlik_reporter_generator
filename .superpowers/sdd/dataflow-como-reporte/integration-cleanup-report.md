# Integration cleanup — Reporte

## Status

Completado.

## Alcance

- Se verificó que `crear-reporte` y `clonar-reporte` no tenían consumidores productivos fuera de sus propios archivos obsoletos.
- Se eliminaron ambos casos de uso y sus pruebas.
- Se actualizaron las pruebas de esquema y composición para la arquitectura Dataflow como reporte.
- No se tocaron frontend, migraciones, esquema productivo, contratos, puerto/repositorio de reportes, descargas ni lógica de workers.

## Cambios verificados

- `esquema.test.ts` confirma que `reportes` no se exporta y que `ejecuciones_reportes` conserva scope y snapshots (`organizacion_id`, `tenant_qlik_id`, `flujo_id_qlik`, `flujo_nombre_snapshot`, `flujo_espacio_id_qlik`).
- `app.test.ts` cubre preflight canónico, ausencia de clonado local, ejecución por `flujoId` con worker/plantilla resueltos por servidor y listado/detalle respaldados por Qlik.
- Las pruebas de composición usan fakes y configuración estática para no consultar DB real.

## Verificaciones

- PASS — suite solicitada: 45 pass, 0 fail.
- PASS — `bun run --cwd apps/api typecheck`.
- PASS — `bunx biome check` en archivos modificados.
- PASS — `git diff --check`.

## Commit

Pendiente de crear con el mensaje solicitado: `refactor: retirar consumidores del reporte local`.
