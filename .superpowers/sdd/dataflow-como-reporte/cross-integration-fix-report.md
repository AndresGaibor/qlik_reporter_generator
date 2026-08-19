# Cross-integration fix report

## RED evidence

Before the implementation, the two canonical route tests in `rutas-reportes-dataflow.test.ts` failed with HTTP `404` for:

- `GET /api/reportes/plantilla-base` (expected `200`)
- `POST /api/reportes/desde-plantilla` (expected `201`)

## Changed files

- Added `apps/api/src/modulos/flujos/http/rutas-clonado-dataflow.ts` with the shared tenant authorization and Qlik template-cloning behavior.
- Mounted the shared routes under canonical `/api/reportes` and retained `/api/flujos` as compatibility surface.
- Added canonical route tests and wired the composition root dependencies.
- Removed `/reportes/nueva`; updated legacy Dataflow links to `/reportes`.
- Added `flujoIdQlik` only to the affected download test fixtures.
- Removed unused `reporteId` and `obtenerPorId` fixture noise from the pipeline integration test.

## Validation

- API grouped tests: **22 passed, 0 failed**.
- Web grouped tests: **17 files, 46 tests passed**.
- API typecheck: **passed**.
- Web typecheck: **passed**.
- Biome changed files: **passed**.
- `git diff --check`: **passed**.

## Commit

Commit: `fix: cerrar integracion dataflow como reporte`
