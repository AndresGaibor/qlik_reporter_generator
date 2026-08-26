# AGENTS.md — Frontend / flujos

Detalle técnico de Dataflows Qlik.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `componentes/`.

Tests cercanos:
- `apps/web/src/modulos/flujos/api.test.ts`
- `apps/web/src/modulos/flujos/componentes/detalle/pestana-metadata-flujo.test.tsx`
- `apps/web/src/modulos/flujos/componentes/detalle/pestana-script-flujo.test.tsx`

Imports internos frecuentes detectados:
- `../../api`
- `./api`
- `./pestana-metadata-flujo`
- `./pestana-script-flujo`
- `./rutas`
- `@qlik/contratos/automatizaciones`
- `@qlik/contratos/flujos`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Flujo de cambio

Revisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/modulos/flujos/publico.ts`
- `apps/web/src/modulos/flujos/api.ts`
- `apps/web/src/modulos/flujos/rutas.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
