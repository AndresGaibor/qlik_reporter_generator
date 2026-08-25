# Dependencias y límites

## Dirección preferida

`web feature` → `contratos` → HTTP → `backend http` → `aplicacion` → `puertos/dominio` → `infraestructura`.

`app.ts` puede conocer implementaciones concretas porque es el composition root. El dominio y la aplicación no deberían importar Hono ni Postgres directamente cuando existe un puerto.

## Dependencias transversales importantes

- `reportes` depende de Qlik, BigQuery/configuración Google Cloud, automatizaciones personales y descargas GCS.
- `admin` configura datos consumidos por autenticación, Qlik y Google Cloud.
- `flujos` consume Qlik Cloud para descubrir/clonar Dataflows.
- `packages/contratos` es consumido por web y API, por eso sus cambios tienen mayor radio.

Consulta `NAVIGATION.json` para imports detectados por área antes de cambiar una frontera.
