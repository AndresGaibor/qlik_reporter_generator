# AGENTS.md — Web src

Frontend React/Vite. `app/` compone navegación/providers; `compartido/` contiene UI/hooks reutilizables; `modulos/` agrupa funcionalidades.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `app/`, `compartido/`, `modulos/`.

Tests cercanos:
- `apps/web/src/app/navegacion.test.ts`
- `apps/web/src/compartido/api/cliente.test.ts`
- `apps/web/src/compartido/componentes/ui/estado-carga.test.tsx`
- `apps/web/src/compartido/componentes/ui/page-header.test.tsx`
- `apps/web/src/compartido/utiles/automatizaciones.test.ts`
- `apps/web/src/compartido/utiles/qlik-urls.test.ts`
- `apps/web/src/favicon.test.ts`
- `apps/web/src/modulos/admin/api.test.ts`
- `apps/web/src/modulos/admin/componentes/bigquery-formulario.test.ts`
- `apps/web/src/modulos/admin/componentes/navegacion-configuracion.test.tsx`
- `apps/web/src/modulos/admin/componentes/oauth-formulario.test.ts`
- `apps/web/src/modulos/admin/componentes/oauth-resumen.test.tsx`

Imports internos frecuentes detectados:
- `../../api`
- `../../utiles-presentacion-reporte`
- `../api`
- `../presentacion-ejecucion`
- `../use-descarga-ejecucion`
- `../utiles-estado-configuracion`
- `../utiles-presentacion-qlik`
- `./PaginaSuperadmins`
- `./api`
- `./app/router`
- `./automatizaciones`
- `./barra-filtros-reportes`
- `./bigquery-formulario`
- `./button`
- `./cliente`
- `./componentes-header`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/main.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
