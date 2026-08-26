# AGENTS.md — flujos / aplicacion

Casos de uso, servicios y puertos. No acoples esta capa a Hono ni a detalles Postgres/Qlik/GCS.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `casos-de-uso/`, `puertos/`.

Tests cercanos:
- `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts`

Imports internos frecuentes detectados:
- `../../dominio/flujo.js`
- `../../reportes/aplicacion/compilador-vnext/index.js`
- `../../reportes/aplicacion/compilador-vnext/modelo.js`
- `../../reportes/aplicacion/parser-dataflow.js`
- `../../reportes/dominio/plan-dataflow.js`
- `../puertos/puerto-consulta-flujos.js`
- `./resumir-dataflow.js`
- `@qlik/contratos/flujos`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/reportes` (4 imports detectados)
- `packages/contratos/src/flujos` (3 imports detectados)
- `apps/api/src/nucleo` (2 imports detectados)
- `apps/api/src/modulos/qlik` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
