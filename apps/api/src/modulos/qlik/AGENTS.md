# AGENTS.md — Backend / qlik

Adaptador HTTP y proxy controlado hacia APIs de Qlik Cloud.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/qlik/infraestructura/cliente-http-qlik.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/errores/error-aplicacion.js`
- `../aplicacion/casos-de-uso/reenviar-solicitud-qlik.js`
- `../aplicacion/puertos/puerto-qlik.js`
- `../dominio/modelos-qlik.js`
- `../puertos/puerto-qlik.js`
- `./aplicacion/puertos/puerto-qlik.js`
- `./cliente-http-qlik.js`
- `./dominio/modelos-qlik.js`
- `./error-api-qlik.js`
- `./http/rutas-proxy-qlik.js`
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

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/qlik/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
