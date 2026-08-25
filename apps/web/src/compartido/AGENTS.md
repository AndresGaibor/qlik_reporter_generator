# AGENTS.md — Web / compartido

Cliente API, UI, feedback, hooks y utilidades reutilizables. No introduzcas dependencia hacia un módulo funcional concreto.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `api/`, `componentes/`, `hooks/`, `utiles/`.

Tests cercanos:
- `apps/web/src/compartido/api/cliente.test.ts`
- `apps/web/src/compartido/componentes/ui/estado-carga.test.tsx`
- `apps/web/src/compartido/componentes/ui/page-header.test.tsx`
- `apps/web/src/compartido/utiles/automatizaciones.test.ts`
- `apps/web/src/compartido/utiles/qlik-urls.test.ts`

Imports internos frecuentes detectados:
- `./automatizaciones`
- `./button`
- `./cliente`
- `./estado-carga`
- `./formateador-fechas`
- `./icon`
- `./page-header`
- `./qlik-urls`
- `@qlik/contratos/autenticacion`
- `@qlik/contratos/comun`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/web/src/app` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
