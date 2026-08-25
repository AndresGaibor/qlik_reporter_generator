# AGENTS.md — qlik / http

Rutas/adaptadores HTTP. Valida entrada, resuelve contexto y delega; evita lógica de negocio aquí.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Imports internos frecuentes detectados:
- `../../../nucleo/errores/error-aplicacion.js`
- `../aplicacion/casos-de-uso/reenviar-solicitud-qlik.js`
- `../aplicacion/puertos/puerto-qlik.js`
- `./proxy-utils.js`
- `./rutas-automation-connections.js`
- `./rutas-automations.js`
- `./rutas-spaces.js`
- `./rutas-users.js`
- `@qlik/contratos/qlik`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `packages/contratos/src/qlik` (5 imports detectados)
- `apps/api/src/nucleo` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
