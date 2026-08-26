# AGENTS.md — API src

Composición de la API Hono. `app.ts` es el composition root; `entradas/` adapta runtimes, `modulos/` contiene negocio, `nucleo/` primitives y `plataforma/` infraestructura transversal.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `entradas/`, `modulos/`, `nucleo/`, `plataforma/`.

Tests cercanos:
- `apps/api/src/app.test.ts`
- `apps/api/src/arquitectura-integraciones-activas.test.ts`
- `apps/api/src/arquitectura-task9.test.ts`
- `apps/api/src/arquitectura.test.ts`
- `apps/api/src/dependencias-google-uuid.test.ts`
- `apps/api/src/esquema.test.ts`
- `apps/api/src/migracion-trazabilidad.test.ts`
- `apps/api/src/modulos/admin/dominio/tenant-qlik.test.ts`
- `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-oauth.test.ts`
- `apps/api/src/modulos/admin/infraestructura/helpers-admin.test.ts`

Imports internos frecuentes detectados:
- `../../../../google-cloud/dominio/metadata-bigquery.js`
- `../../../../nucleo/errores/error-aplicacion.js`
- `../../../../nucleo/http/respuestas.js`
- `../../../../plataforma/persistencia/conexion.js`
- `../../../google-cloud/aplicacion/puerto-jobs-bigquery.js`
- `../../../google-cloud/dominio/metadata-bigquery.js`
- `../../../nucleo/auditoria/puerto-auditoria.js`
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/sesion/tipos-sesion.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../../nucleo/valores/normalizar-host-qlik.js`
- `../../../plataforma/observabilidad/registrador.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../../plataforma/seguridad/servicio-cifrado.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/app.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
