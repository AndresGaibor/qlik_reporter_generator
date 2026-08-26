# AGENTS.md — admin / http

Rutas/adaptadores HTTP. Valida entrada, resuelve contexto y delega; evita lógica de negocio aquí.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-bigquery.test.ts`
- `apps/api/src/modulos/admin/http/rutas-configuracion-oauth.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/auditoria/puerto-auditoria.js`
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/valores/generar-uuid.js`
- `../../automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.js`
- `../../qlik/publico.js`
- `../../reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.js`
- `../../reportes/aplicacion/servicio-contexto-talend.js`
- `../aplicacion/casos-de-uso/actualizar-tenant.js`
- `../aplicacion/casos-de-uso/actualizar-usuario.js`
- `../aplicacion/casos-de-uso/agregar-usuario.js`
- `../aplicacion/casos-de-uso/crear-tenant.js`
- `../aplicacion/casos-de-uso/eliminar-tenant.js`
- `../aplicacion/casos-de-uso/eliminar-usuario.js`
- `../aplicacion/casos-de-uso/gestionar-tenants-qlik.js`
- `../aplicacion/casos-de-uso/listar-tenants.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/nucleo` (16 imports detectados)
- `apps/api/src/plataforma` (15 imports detectados)
- `packages/contratos/src/admin` (6 imports detectados)
- `apps/api/src/modulos/reportes` (5 imports detectados)
- `apps/api/src/modulos/qlik` (4 imports detectados)
- `apps/api/src/modulos/automatizaciones` (1 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
