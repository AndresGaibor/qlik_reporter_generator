# AGENTS.md — reportes / aplicacion

Casos de uso, servicios y puertos. No acoples esta capa a Hono ni a detalles Postgres/Qlik/GCS.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `compilador-vnext/`, `puertos/`.

Tests cercanos:
- `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/agregados-financieros.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/cobertura-corpus.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/comparar-compiladores.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/control-flow.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/corpus-ejecutable.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik-numericas-runtime.test.ts`
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik-parser-texto.test.ts`

Imports internos frecuentes detectados:
- `../../../../google-cloud/dominio/metadata-bigquery.js`
- `../../../google-cloud/dominio/metadata-bigquery.js`
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js`
- `../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js`
- `../../fixtures/compiler-corpus/conformance-catalog.json`
- `../../fixtures/compiler-corpus/coverage-manifest.json`
- `../../fixtures/compiler-corpus/function-vectors.json`
- `../../fixtures/compiler-corpus/runtime-function-status.json`
- `../../fixtures/compiler-corpus/scenarios.json`
- `../../google-cloud/dominio/metadata-bigquery.js`
- `../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../qlik/dominio/modelos-qlik.js`
- `../../qlik/infraestructura/error-api-qlik.js`
- `../agregados-financieros.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (13 imports detectados)
- `apps/api/src/modulos/google-cloud` (6 imports detectados)
- `apps/api/src/nucleo` (5 imports detectados)
- `apps/api/src/modulos/automatizaciones` (4 imports detectados)
- `apps/api/src/modulos/flujos` (4 imports detectados)
- `apps/api/src/plataforma` (4 imports detectados)
- `packages/contratos/src` (1 imports detectados)
- `apps/api/src/modulos/descargas` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
