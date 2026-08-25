# AGENTS.md — Backend / flujos

Consulta y clonado de Dataflows Qlik usados como fuente de reportes.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.test.ts`
- `apps/api/src/modulos/flujos/http/rutas.test.ts`
- `apps/api/src/modulos/flujos/infraestructura/consulta-flujos-qlik.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/http/respuestas.js`
- `../../dominio/flujo.js`
- `../../qlik/publico.js`
- `../../reportes/aplicacion/compilador-vnext/index.js`
- `../../reportes/aplicacion/compilador-vnext/modelo.js`
- `../../reportes/aplicacion/parser-dataflow.js`
- `../../reportes/dominio/plan-dataflow.js`
- `../aplicacion/casos-de-uso/listar-flujos.js`
- `../aplicacion/puertos/puerto-consulta-flujos.js`
- `../aplicacion/resumir-dataflow.js`
- `../dominio/flujo.js`
- `../puertos/puerto-consulta-flujos.js`
- `./aplicacion/puertos/puerto-consulta-flujos.js`
- `./consulta-flujos-qlik.js`
- `./dominio/flujo.js`
- `./http/rutas.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/flujos/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
