# AGENTS.md — Web / modulos

Features frontend. Cada módulo debe consumir contratos/API sin acoplarse a internals de otro módulo.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `admin/`, `autenticacion/`, `descargas/`, `flujos/`, `inicio/`, `reportes/`, `setup/`.

Tests cercanos:
- `apps/web/src/modulos/admin/api.test.ts`
- `apps/web/src/modulos/admin/componentes/bigquery-formulario.test.ts`
- `apps/web/src/modulos/admin/componentes/navegacion-configuracion.test.tsx`
- `apps/web/src/modulos/admin/componentes/oauth-formulario.test.ts`
- `apps/web/src/modulos/admin/componentes/oauth-resumen.test.tsx`
- `apps/web/src/modulos/admin/componentes/resumen-configuracion.test.tsx`
- `apps/web/src/modulos/admin/componentes/resumen-plantilla-base.test.tsx`
- `apps/web/src/modulos/admin/componentes/seccion-bigquery.test.tsx`
- `apps/web/src/modulos/admin/componentes/secciones-configuracion.test.tsx`
- `apps/web/src/modulos/admin/componentes/usuarios-permisos.test.ts`
- `apps/web/src/modulos/admin/configuracion-sin-conexiones.test.ts`
- `apps/web/src/modulos/admin/utiles-configuracion.test.ts`

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
- `./barra-filtros-reportes`
- `./bigquery-formulario`
- `./componentes/barra-filtros-reportes`
- `./componentes/lista-reportes`
- `./componentes/modal-agregar-superadmin`
- `./componentes/modal-crear-reporte-desde-plantilla`
- `./componentes/navegacion-configuracion`

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
