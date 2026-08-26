# AGENTS.md — Compilador vNext

Compilador activo Qlik → BigQuery. Es una zona de alta conectividad: un cambio de AST/IR suele requerir parser, semántica, emisor y tests.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `agregados-financieros/`, `analizador-semantico/`, `conformance-gates/`, `emisor-bigquery/`, `estadistica/`, `expresiones-qlik/`, `parser-programa/`.

Tests cercanos:
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
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik-temporal-agregados.test.ts`

Imports internos frecuentes detectados:
- `../../../../google-cloud/dominio/metadata-bigquery.js`
- `../../../google-cloud/dominio/metadata-bigquery.js`
- `../../fixtures/compiler-corpus/conformance-catalog.json`
- `../../fixtures/compiler-corpus/coverage-manifest.json`
- `../../fixtures/compiler-corpus/function-vectors.json`
- `../../fixtures/compiler-corpus/runtime-function-status.json`
- `../../fixtures/compiler-corpus/scenarios.json`
- `../agregados-financieros.js`
- `../ast.js`
- `../compilador-bigquery.js`
- `../control-flujo.js`
- `../estadistica.js`
- `../expresiones-qlik.js`
- `../geospatial.js`
- `../index.js`
- `../inter-record-metadata.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Pipeline

`index.ts` → `parser-programa` → `analizador-semantico` → `optimizador-ir.ts` → `emisor-bigquery`.

Antes de añadir una función Qlik revisa `registro-funciones.ts`, el dispatcher de expresiones y los fixtures/tests de cobertura. Mantén el compilador legacy fuera de cambios nuevos salvo compatibilidad explícita.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/index.ts`

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (13 imports detectados)
- `apps/api/src/modulos/google-cloud` (9 imports detectados)
- `apps/api/src/nucleo` (5 imports detectados)
- `apps/api/src/modulos/automatizaciones` (4 imports detectados)
- `apps/api/src/modulos/flujos` (4 imports detectados)
- `apps/api/src/plataforma` (4 imports detectados)
- `packages/contratos/src` (1 imports detectados)
- `apps/api/src/modulos/descargas` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
