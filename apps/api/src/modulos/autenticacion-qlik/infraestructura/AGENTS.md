# AGENTS.md — autenticacion-qlik / infraestructura

Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/cliente-oauth-qlik.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/consulta-identidad-sesion-postgres.test.ts`
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/repositorio-configuracion-oauth-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../aplicacion/puertos/puerto-oauth-qlik.js`
- `../aplicacion/puertos/repositorio-autenticacion.js`
- `../aplicacion/servicio-autenticacion.js`
- `../dominio/modelos.js`
- `../dominio/superadministrador.js`
- `../dominio/validador-host-qlik.js`
- `./cliente-oauth-qlik.js`
- `./consulta-credenciales-postgres.js`
- `./consulta-identidad-postgres.js`
- `./consulta-identidad-sesion-postgres.js`
- `./consulta-sesion-postgres.js`
- `./hashing-postgres.js`
- `./repositorio-autenticacion-postgres.js`
- `./repositorio-configuracion-oauth-postgres.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Entry points probables:
- `apps/api/src/modulos/autenticacion-qlik/infraestructura/publico.ts`

Dependencias externas a esta área:
- `apps/api/src/plataforma` (9 imports detectados)
- `apps/api/src/nucleo` (3 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
