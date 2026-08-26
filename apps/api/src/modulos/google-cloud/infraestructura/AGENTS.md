# AGENTS.md — google-cloud / infraestructura

Adaptadores concretos para Postgres, Qlik, Google Cloud u otros servicios.

## Antes de modificar

- Lee el `AGENTS.md` de los directorios padre; estas reglas son acumulativas.
- Busca consumidores y contratos antes de cambiar una firma pública.
- Mantén los cambios dentro de este límite salvo que el mapa de dependencias indique un cambio transversal.
- No edites `dist`, `node_modules`, `.worktrees` ni artefactos generados.

## Navegación local


Tests cercanos:
- `apps/api/src/modulos/google-cloud/infraestructura/cliente-jobs-bigquery.test.ts`
- `apps/api/src/modulos/google-cloud/infraestructura/estimador-bigquery.test.ts`
- `apps/api/src/modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.test.ts`

Imports internos frecuentes detectados:
- `../../../nucleo/errores/error-aplicacion.js`
- `../../../plataforma/persistencia/conexion.js`
- `../../../plataforma/persistencia/esquema.js`
- `../../../plataforma/seguridad/servicio-cifrado.js`
- `../aplicacion/puerto-jobs-bigquery.js`
- `../dominio/metadata-bigquery.js`
- `./estimador-bigquery.js`
- `./resolver-configuracion-google-cloud-postgres.js`

## Ver también

- `docs/agents/CHANGE-MAP.md`
- `docs/agents/DEPENDENCIES.md`
- `docs/agents/NAVIGATION.json`

<!-- agent-enrichment -->

## Atajos para agentes

Dependencias externas a esta área:
- `apps/api/src/plataforma` (3 imports detectados)
- `apps/api/src/nucleo` (2 imports detectados)

Para una modificación no trivial, busca primero el flujo correspondiente en `docs/agents/FEATURE-FLOWS.md`.
Consulta `docs/agents/HOTSPOTS.md` antes de editar archivos de alta conectividad.
