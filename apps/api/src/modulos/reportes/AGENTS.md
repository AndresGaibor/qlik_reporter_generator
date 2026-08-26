# AGENTS.md — Backend / reportes

Creación, compilación, ejecución y sincronización de reportes Dataflow.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `fixtures/`, `http/`, `infraestructura/`.

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
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js`
- `../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js`
- `../../descargas/aplicacion/puerto-almacenamiento-descargas.js`
- `../../fixtures/compiler-corpus/conformance-catalog.json`
- `../../fixtures/compiler-corpus/coverage-manifest.json`
- `../../fixtures/compiler-corpus/function-vectors.json`
- `../../fixtures/compiler-corpus/runtime-function-status.json`
- `../../fixtures/compiler-corpus/scenarios.json`
- `../../flujos/aplicacion/casos-de-uso/listar-flujos.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
