# AGENTS.md — Backend / automatizaciones

Panel y copia/ejecución coordinada de automatizaciones Qlik.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/consultar-panel.test.ts`
- `apps/api/src/modulos/automatizaciones/aplicacion/mapeador-panel.test.ts`
- `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.test.ts`
- `apps/api/src/modulos/automatizaciones/http/rutas-panel.test.ts`
- `apps/api/src/modulos/automatizaciones/infraestructura/consulta-tenant-qlik-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/http/respuestas.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../../qlik/dominio/modelos-qlik.js`
- `../../../qlik/publico.js`
- `../../../reportes/aplicacion/servicio-contexto-talend.js`
- `../../qlik/aplicacion/puertos/puerto-qlik.js`
- `../../qlik/dominio/modelos-qlik.js`
- `../../qlik/publico.js`
- `../aplicacion/casos-de-uso/consultar-panel.js`
- `../aplicacion/puertos/puerto-bloqueo-ejecucion.js`
- `../aplicacion/puertos/puerto-consulta-tenant-qlik.js`
- `../dominio/estado-ejecucion.js`
- `../mapeador-panel.js`
- `./aplicacion/puertos/puerto-bloqueo-ejecucion.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/automatizaciones/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
