# AGENTS.md — Backend / descargas

Exploración y descarga privada de exportaciones almacenadas en GCS.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts`
- `apps/api/src/modulos/descargas/http/rutas-descargas.test.ts`
- `apps/api/src/modulos/descargas/http/rutas-explorador-gcs.test.ts`
- `apps/api/src/modulos/descargas/infraestructura/cliente-gcs.test.ts`

Imports internos frecuentes detectados:
- `../../../../nucleo/errores/error-aplicacion.js`
- `../../../../nucleo/http/respuestas.js`
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js`
- `../../../reportes/aplicacion/sincronizar-ejecuciones-reporte.js`
- `../../aplicacion/puerto-almacenamiento-descargas.js`
- `../../aplicacion/servicio-descargas.js`
- `../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js`
- `../../reportes/dominio/destino-gcs.js`
- `../aplicacion/puerto-almacenamiento-descargas.js`
- `./cliente-gcs.js`
- `./helpers.js`
- `./puerto-almacenamiento-descargas.js`
- `./rutas-descargas.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
