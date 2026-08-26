# AGENTS.md — Módulos backend

Cada carpeta es un límite funcional. Prefiere dependencias mediante puertos/public APIs; evita imports cruzados a infraestructura de otro módulo.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `admin/`, `autenticacion-qlik/`, `automatizaciones/`, `descargas/`, `flujos/`, `google-cloud/`, `qlik/`, `reportes/`, `setup/`.

Tests cercanos:
- `apps/api/src/modulos/admin/dominio/tenant-qlik.test.ts`
- `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-oauth.test.ts`
- `apps/api/src/modulos/admin/infraestructura/helpers-admin.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/aplicacion/servicio-autenticacion.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/dominio/superadministrador.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/http/rutas.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/cliente-oauth-qlik.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/consulta-identidad-sesion-postgres.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/repositorio-configuracion-oauth-postgres.test.ts`
- `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/consultar-panel.test.ts`

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

Dependencias externas a esta área:
- `apps/api/src/plataforma` (23 imports detectados)
- `apps/api/src/modulos/reportes` (8 imports detectados)
- `apps/api/src/modulos/automatizaciones` (7 imports detectados)
- `apps/api/src/modulos/admin` (4 imports detectados)
- `apps/api/src/nucleo` (4 imports detectados)
- `apps/api/src/modulos/descargas` (3 imports detectados)
- `apps/api/src/modulos/google-cloud` (3 imports detectados)
- `apps/api/src/modulos/autenticacion-qlik` (2 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
