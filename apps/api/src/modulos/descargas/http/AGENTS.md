# AGENTS.md — descargas / http

Rutas/adaptadores HTTP. Valida entrada, resuelve contexto y delega; evita lógica de negocio aquí.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `rutas-descargas/`.

Tests cercanos:
- `apps/api/src/modulos/descargas/http/rutas-descargas-bigquery.test.ts`
- `apps/api/src/modulos/descargas/http/rutas-descargas.test.ts`
- `apps/api/src/modulos/descargas/http/rutas-explorador-gcs.test.ts`

Imports internos frecuentes detectados:
- `../../../../nucleo/errores/error-aplicacion.js`
- `../../../../nucleo/http/respuestas.js`
- `../../../google-cloud/aplicacion/puerto-jobs-bigquery.js`
- `../../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js`
- `../../../reportes/aplicacion/sincronizar-ejecuciones-reporte.js`
- `../../../reportes/aplicacion/sincronizar-jobs-bigquery-ejecucion.js`
- `../../aplicacion/puerto-almacenamiento-descargas.js`
- `../../aplicacion/servicio-descargas.js`
- `../../google-cloud/aplicacion/puerto-jobs-bigquery.js`
- `../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js`
- `../aplicacion/puerto-almacenamiento-descargas.js`
- `./helpers.js`
- `./rutas-descargas.js`
- `./rutas-descargas/registrar-carpetas.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/reportes` (10 imports detectados)
- `apps/api/src/nucleo` (8 imports detectados)
- `apps/api/src/modulos/qlik` (4 imports detectados)
- `apps/api/src/modulos/google-cloud` (3 imports detectados)
- `packages/contratos/src/descargas` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
