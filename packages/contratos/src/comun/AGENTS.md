# AGENTS.md — Contratos / comun

Contratos compartidos del dominio `comun`. Busca consumidores en `apps/web` y `apps/api` antes de cambiar campos, enums o schemas.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Imports internos frecuentes detectados:
- `./respuesta-api.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `packages/contratos/src/comun/index.ts`

Dependencias externas a esta área:
- `packages/contratos/src/admin` (1 imports detectados)
- `packages/contratos/src/autenticacion` (1 imports detectados)
- `packages/contratos/src/automatizaciones` (1 imports detectados)
- `packages/contratos/src/comun` (1 imports detectados)
- `packages/contratos/src/descargas` (1 imports detectados)
- `packages/contratos/src/flujos` (1 imports detectados)
- `packages/contratos/src/qlik` (1 imports detectados)
- `packages/contratos/src/reportes` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
