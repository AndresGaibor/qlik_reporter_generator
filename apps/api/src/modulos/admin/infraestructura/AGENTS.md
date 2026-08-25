# AGENTS.md — admin / infraestructura

Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/admin/infraestructura/helpers-admin.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../aplicacion/puertos/repositorio-administracion.js`
- `../dominio/tenant-qlik.js`
- `../dominio/validador-host-qlik.js`
- `./consulta-configuracion-oauth-postgres.js`
- `./consulta-organizacion-postgres.js`
- `./consulta-tenant-qlik-postgres.js`
- `./consulta-usuario-postgres.js`
- `./helpers-admin.js`
- `./repositorio-administracion-postgres.js`
- `./servicio-bigquery-admin-postgres.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/admin/infraestructura/publico.ts`

Dependencias externas a esta área:
- `apps/api/src/nucleo` (16 imports detectados)
- `apps/api/src/plataforma` (15 imports detectados)
- `packages/contratos/src/admin` (6 imports detectados)
- `apps/api/src/modulos/reportes` (5 imports detectados)
- `apps/api/src/modulos/qlik` (4 imports detectados)
- `apps/api/src/modulos/automatizaciones` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
