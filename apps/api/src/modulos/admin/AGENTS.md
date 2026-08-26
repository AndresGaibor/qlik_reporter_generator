# AGENTS.md — Backend / admin

Administración de tenants, usuarios, superadmins y configuración BigQuery/OAuth.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/admin/dominio/tenant-qlik.test.ts`
- `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-oauth.test.ts`
- `apps/api/src/modulos/admin/infraestructura/helpers-admin.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/auditoria/puerto-auditoria.js`
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../../nucleo/valores/normalizar-host-qlik.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js`
- `../../dominio/slug-organizacion.js`
- `../../qlik/publico.js`
- `../../reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js`
- `../../reportes/aplicacion/servicio-contexto-talend.js`
- `../aplicacion/casos-de-uso/actualizar-tenant.js`
- `../aplicacion/casos-de-uso/actualizar-usuario.js`
- `../aplicacion/casos-de-uso/agregar-usuario.js`
- `../aplicacion/casos-de-uso/crear-tenant.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/admin/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
