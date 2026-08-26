# AGENTS.md — autenticacion-qlik / aplicacion

Casos de uso, servicios y puertos. No acoples esta capa a Hono ni a detalles Postgres/Qlik/GCS.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local

Subdirectorios: `puertos/`.

Tests cercanos:
- `apps/api/src/modulos/autenticacion-qlik/aplicacion/servicio-autenticacion.test.ts`

Imports internos frecuentes detectados:
- `../../../../plataforma/persistencia/conexion.js`
- `../../dominio/modelos.js`
- `./puertos/puerto-oauth-qlik.js`
- `./puertos/repositorio-autenticacion.js`
- `./servicio-autenticacion.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/plataforma` (9 imports detectados)
- `apps/api/src/nucleo` (3 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
