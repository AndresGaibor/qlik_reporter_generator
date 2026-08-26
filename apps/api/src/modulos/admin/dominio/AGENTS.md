# AGENTS.md — admin / dominio

Tipos, invariantes y reglas puras del módulo.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/admin/dominio/tenant-qlik.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/valores/normalizar-host-qlik.js`
- `./tenant-qlik.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/nucleo` (16 imports detectados)
- `apps/api/src/plataforma` (15 imports detectados)
- `packages/contratos/src/admin` (6 imports detectados)
- `apps/api/src/modulos/reportes` (5 imports detectados)
- `apps/api/src/modulos/qlik` (4 imports detectados)
- `apps/api/src/modulos/automatizaciones` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
