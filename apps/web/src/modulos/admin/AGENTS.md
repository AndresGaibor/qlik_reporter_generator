# AGENTS.md — Frontend / admin

Pantallas de configuración, tenants, usuarios, OAuth y BigQuery.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `componentes/`, `hooks/`.

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
- `../api`
- `../utiles-estado-configuracion`
- `../utiles-presentacion-qlik`
- `./PaginaSuperadmins`
- `./api`
- `./bigquery-formulario`
- `./componentes/modal-agregar-superadmin`
- `./componentes/navegacion-configuracion`
- `./componentes/resumen-configuracion`
- `./componentes/seccion-automatizacion-base-tenant`
- `./componentes/seccion-bigquery`
- `./componentes/seccion-dataflow-base-tenant`
- `./componentes/seccion-info-tenant`
- `./componentes/seccion-oauth-qlik`
- `./componentes/seccion-qlik-cloud`
- `./componentes/seccion-usuarios`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Flujo de cambio

Revisa `api.ts` para transporte, `rutas.tsx` para entrada de navegación, páginas para orquestación y `componentes/` para presentación. Si cambia el payload, empieza en `packages/contratos`.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/web/src/modulos/admin/publico.ts`
- `apps/web/src/modulos/admin/api.ts`
- `apps/web/src/modulos/admin/rutas.tsx`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
