# AGENTS.md — Frontend / setup

Wizard de configuración inicial.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `componentes/`.

Tests cercanos:
- `apps/web/src/modulos/setup/scopes-oauth.test.ts`

Imports internos frecuentes detectados:
- `./api`
- `./componentes/paso-1-empresa`
- `./componentes/paso-2-qlik`
- `./componentes/paso-3-admin`
- `./pagina-setup`
- `./paso-1-empresa`
- `./rutas`
- `./scopes-oauth`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Flujo de cambio

Revisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/modulos/setup/publico.ts`
- `apps/web/src/modulos/setup/api.ts`
- `apps/web/src/modulos/setup/rutas.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
