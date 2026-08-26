# AGENTS.md — Backend / setup

Bootstrap funcional de la aplicación y configuración inicial.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/setup/aplicacion/servicio-setup.test.ts`
- `apps/api/src/modulos/setup/http/rutas-setup.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../aplicacion/puerto/puerto-configuracion-app.js`
- `../aplicacion/servicio-setup.js`
- `./http/rutas-setup.js`
- `./puerto/puerto-configuracion-app.js`
- `./rutas-setup.js`
- `./servicio-setup.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/setup/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
