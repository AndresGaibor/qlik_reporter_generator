# AGENTS.md — Qlik Reportes Creator

## Propósito

Monorepo Bun para crear y ejecutar reportes basados en Qlik Dataflow, compilarlos a BigQuery y administrar descargas GCS. Antes de explorar código, usa `docs/agents/INDEX.md` y `docs/agents/CHANGE-MAP.md`.

## Workspaces

- `apps/web`: React/Vite, rutas y experiencia de usuario.
- `apps/api`: Hono, casos de uso, Qlik, BigQuery, GCS y persistencia.
- `packages/contratos`: esquemas/tipos compartidos frontend-backend.

## Regla principal para cambios

Empieza por la intención en `docs/agents/CHANGE-MAP.md`; después lee el `AGENTS.md` más cercano. Si cambias un contrato público, revisa consumidor frontend, ruta HTTP, caso de uso/adaptador y tests asociados.

## Comandos seguros

- `bun run agents:check`: valida navegación sin servicios externos.
- `bun run typecheck`: chequeo TypeScript.
- `bun run test`: suite local; puede requerir configuración según el test.
- `bun run verify`: lint + typecheck + tests + build.

No hagas consultas BigQuery reales para validar compilación; usa tests, fixtures, dry-run explícito cuando corresponda y dobles existentes.

## Mapas

- `docs/agents/ARCHITECTURE.md`
- `docs/agents/BACKEND.md`
- `docs/agents/FRONTEND.md`
- `docs/agents/CONTRACTS.md`
- `docs/agents/COMPILER.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
