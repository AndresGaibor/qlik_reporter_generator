# AGENTS.md — Backend / autenticacion-qlik

Sesiones de usuario, OAuth Qlik, credenciales e identidades Qlik.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `aplicacion/`, `dominio/`, `http/`, `infraestructura/`.

Tests cercanos:
- `apps/api/src/modulos/autenticacion-qlik/aplicacion/servicio-autenticacion.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/dominio/superadministrador.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/http/rutas.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/cliente-oauth-qlik.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/consulta-identidad-sesion-postgres.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/repositorio-configuracion-oauth-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../../plataforma/persistencia/conexion.js`
- `../../../nucleo/http/respuestas.js`
- `../../../nucleo/sesion/tipos-sesion.js`
- `../../../nucleo/valores/normalizar-host-qlik.js`
- `../../../plataforma/observabilidad/registrador.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../dominio/modelos.js`
- `../aplicacion/puertos/puerto-oauth-qlik.js`
- `../aplicacion/puertos/repositorio-autenticacion.js`
- `../aplicacion/servicio-autenticacion.js`
- `../dominio/modelos.js`
- `../dominio/superadministrador.js`
- `../dominio/validador-host-qlik.js`
- `../infraestructura/cliente-oauth-qlik.js`
- `./aplicacion/puertos/repositorio-autenticacion.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

## Regla de capas

`http` adapta Hono → aplicación; `aplicacion` orquesta; `dominio` contiene reglas puras; `infraestructura` implementa puertos. Mantén esa dirección de dependencias.

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/autenticacion-qlik/publico.ts`

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
