# AGENTS.md — Frontend / reportes

Listado, creación, detalle, preflight y ejecución de reportes.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `componentes/`, `hooks/`.

Tests cercanos:
- `apps/web/src/modulos/reportes/api-dataflow.test.ts`
- `apps/web/src/modulos/reportes/componentes/barra-filtros-reportes.test.tsx`
- `apps/web/src/modulos/reportes/componentes/detalle/historial-auditoria-reporte.test.tsx`
- `apps/web/src/modulos/reportes/componentes/estado-preflight.test.tsx`
- `apps/web/src/modulos/reportes/componentes/lista-reportes.test.tsx`
- `apps/web/src/modulos/reportes/componentes/modal-crear-reporte-desde-plantilla.test.tsx`
- `apps/web/src/modulos/reportes/componentes/paginacion-lista.test.tsx`
- `apps/web/src/modulos/reportes/hooks/use-busqueda-diferida.test.tsx`
- `apps/web/src/modulos/reportes/pagina-detalle-reporte.test.tsx`
- `apps/web/src/modulos/reportes/pagina-reportes.test.tsx`
- `apps/web/src/modulos/reportes/utiles-presentacion-reporte.test.ts`

Imports internos frecuentes detectados:
- `../../utiles-presentacion-reporte`
- `../api`
- `./api`
- `./barra-filtros-reportes`
- `./componentes/barra-filtros-reportes`
- `./componentes/lista-reportes`
- `./componentes/modal-crear-reporte-desde-plantilla`
- `./componentes/paginacion-lista`
- `./estado-preflight`
- `./historial-auditoria-reporte`
- `./lista-reportes`
- `./modal-crear-reporte-desde-plantilla`
- `./pagina-detalle-reporte`
- `./pagina-reportes`
- `./paginacion-lista`
- `./rutas`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Flujo de cambio

Revisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/modulos/reportes/publico.ts`
- `apps/web/src/modulos/reportes/api.ts`
- `apps/web/src/modulos/reportes/rutas.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
