# AGENTS.md — Plataforma backend

Infraestructura transversal: configuración, contexto, HTTP, persistencia, seguridad y observabilidad.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `bootstrap/`, `configuracion/`, `contexto/`, `errores/`, `http/`, `observabilidad/`, `persistencia/`, `seguridad/`.

Tests cercanos:
- `apps/api/src/plataforma/bootstrap/bootstrap.test.ts`
- `apps/api/src/plataforma/configuracion/entorno.test.ts`
- `apps/api/src/plataforma/contexto/contexto-solicitud.test.ts`
- `apps/api/src/plataforma/http/middlewares/limite-solicitudes.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/valores/generar-uuid.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../modulos/qlik/infraestructura/error-api-qlik.js`
- `../../nucleo/auditoria/puerto-auditoria.js`
- `../../nucleo/auditoria/registro-auditoria.js`
- `../../nucleo/errores/error-aplicacion.js`
- `../../nucleo/http/respuestas.js`
- `../../nucleo/idempotencia/puerto-idempotencia.js`
- `../../nucleo/sesion/tipos-sesion.js`
- `../../nucleo/valores/generar-uuid.js`
- `../../nucleo/valores/normalizar-host-qlik.js`
- `../../observabilidad/registrador.js`
- `../observabilidad/registrador.js`
- `../respuestas.js`
- `./bootstrap.js`
- `./conexion.js`

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
- `apps/api/src/modulos/autenticacion-qlik` (2 imports detectados)
- `apps/api/src/modulos/flujos` (2 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
