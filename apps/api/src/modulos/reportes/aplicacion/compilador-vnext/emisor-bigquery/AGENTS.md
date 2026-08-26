# AGENTS.md — Compilador / emisor-bigquery

Convierte el plan semántico/IR a SQL BigQuery y CTEs.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Imports internos frecuentes detectados:
- `../expresiones-qlik.js`
- `../index.js`
- `../inter-record.js`
- `../ir.js`
- `../mapping-applymap.js`
- `../mapping-mapsubstring.js`
- `../metadata.js`
- `../modelo.js`
- `../parser-carga.js`
- `./entornos.js`
- `./fuentes.js`
- `./inter-registro.js`
- `./relacional.js`
- `./tipos.js`
- `./utilidades.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Prueba mínima

Ejecuta primero los tests del subsistema y después los tests de conformance/corpus que puedan cubrir el cambio.

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/modulos/qlik` (13 imports detectados)
- `apps/api/src/modulos/google-cloud` (9 imports detectados)
- `apps/api/src/nucleo` (5 imports detectados)
- `apps/api/src/modulos/automatizaciones` (4 imports detectados)
- `apps/api/src/modulos/flujos` (4 imports detectados)
- `apps/api/src/plataforma` (4 imports detectados)
- `packages/contratos/src` (1 imports detectados)
- `apps/api/src/modulos/descargas` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
