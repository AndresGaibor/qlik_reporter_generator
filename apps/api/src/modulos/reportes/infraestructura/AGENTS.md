# AGENTS.md — reportes / infraestructura

Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts`
- `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js`
- `../aplicacion/puertos/puerto-repositorio-reportes.js`
- `./repositorio-automatizaciones-personales-postgres.js`
- `./repositorio-reportes-postgres.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (13 imports detectados)
- `apps/api/src/modulos/google-cloud` (6 imports detectados)
- `apps/api/src/nucleo` (5 imports detectados)
- `apps/api/src/modulos/automatizaciones` (4 imports detectados)
- `apps/api/src/modulos/flujos` (4 imports detectados)
- `apps/api/src/plataforma` (4 imports detectados)
- `packages/contratos/src` (1 imports detectados)
- `apps/api/src/modulos/descargas` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
