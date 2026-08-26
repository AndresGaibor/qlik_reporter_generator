# AGENTS.md — Núcleo backend

Primitivas compartidas y contratos internos estables. Debe permanecer independiente de módulos e infraestructura concreta.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `auditoria/`, `errores/`, `http/`, `idempotencia/`, `sesion/`, `valores/`.

Imports internos frecuentes detectados:
- `../errores/error-aplicacion.js`
- `./registro-auditoria.js`
- `@qlik/contratos/comun`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/plataforma` (23 imports detectados)
- `apps/api/src/modulos/reportes` (8 imports detectados)
- `apps/api/src/modulos/automatizaciones` (7 imports detectados)
- `apps/api/src/modulos/admin` (4 imports detectados)
- `apps/api/src/nucleo` (4 imports detectados)
- `apps/api/src/modulos/descargas` (3 imports detectados)
- `apps/api/src/modulos/autenticacion-qlik` (2 imports detectados)
- `apps/api/src/modulos/flujos` (2 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
