# AGENTS.md — automatizaciones / aplicacion

Casos de uso, servicios y puertos. No acoples esta capa a Hono ni a detalles Postgres/Qlik/GCS.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `casos-de-uso/`, `puertos/`, `servicios/`.

Tests cercanos:
- `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/consultar-panel.test.ts`
- `apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts`
- `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.test.ts`

Imports internos frecuentes detectados:
- `../../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../../qlik/dominio/modelos-qlik.js`
- `../../../qlik/publico.js`
- `../../../reportes/aplicacion/servicio-contexto-talend.js`
- `../../qlik/dominio/modelos-qlik.js`
- `../dominio/estado-ejecucion.js`
- `../mapeador-panel.js`
- `./consultar-panel.js`
- `./mapeador-panel.js`
- `./servicio-copia-automatizacion.js`
- `@qlik/contratos/automatizaciones`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (8 imports detectados)
- `apps/api/src/plataforma` (3 imports detectados)
- `packages/contratos/src/automatizaciones` (2 imports detectados)
- `apps/api/src/modulos/reportes` (1 imports detectados)
- `apps/api/src/nucleo` (1 imports detectados)
- `packages/contratos/src/qlik` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
