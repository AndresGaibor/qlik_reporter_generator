# AGENTS.md — Packages

Paquetes compartidos del monorepo. Un cambio aquí puede impactar más de un workspace.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `contratos/`.

Tests cercanos:
- `packages/contratos/src/admin/configuracion-bigquery.test.ts`
- `packages/contratos/src/admin/configuracion-secreta.test.ts`
- `packages/contratos/src/admin/tenant-qlik.test.ts`
- `packages/contratos/src/descargas/index.test.ts`
- `packages/contratos/src/reportes/dataflow.test.ts`

Imports internos frecuentes detectados:
- `../qlik/comunes.js`
- `./admin/index.js`
- `./autenticacion/index.js`
- `./automatizaciones.js`
- `./automatizaciones/index.js`
- `./comun/index.js`
- `./comunes.js`
- `./conectores.js`
- `./conexiones.js`
- `./dataflow.js`
- `./descargas/index.js`
- `./espacios.js`
- `./flujos/index.js`
- `./index.js`
- `./panel.js`
- `./qlik/index.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
