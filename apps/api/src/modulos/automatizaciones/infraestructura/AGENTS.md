# AGENTS.md — automatizaciones / infraestructura

Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/automatizaciones/infraestructura/consulta-tenant-qlik-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../aplicacion/puertos/puerto-bloqueo-ejecucion.js`
- `../aplicacion/puertos/puerto-consulta-tenant-qlik.js`
- `./bloqueo-postgres.js`
- `./consulta-tenant-qlik-postgres.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/automatizaciones/infraestructura/publico.ts`

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (8 imports detectados)
- `apps/api/src/plataforma` (3 imports detectados)
- `packages/contratos/src/automatizaciones` (2 imports detectados)
- `apps/api/src/modulos/reportes` (1 imports detectados)
- `apps/api/src/nucleo` (1 imports detectados)
- `packages/contratos/src/qlik` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
