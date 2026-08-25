# AGENTS.md — Backend / google-cloud

Resolución de configuración Google Cloud y estimación/metadata BigQuery.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `dominio/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/google-cloud/infraestructura/estimador-bigquery.test.ts`
- `apps/api/src/modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../../plataforma/seguridad/servicio-cifrado.js`
- `../dominio/metadata-bigquery.js`
- `./estimador-bigquery.js`
- `./resolver-configuracion-google-cloud-postgres.js`

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
