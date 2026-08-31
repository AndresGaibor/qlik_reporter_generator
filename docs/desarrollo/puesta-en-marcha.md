# Puesta en marcha

Hay dos flujos distintos:

- Producción/Docker completo: [Levantar desde cero](../despliegue/LEVANTAR-DESDE-CERO.md). El servicio `migrate` aplica migraciones automáticamente.
- Desarrollo con Bun: [Guía de arranque local](guia-arranque-local.md). En este caso ejecuta `bun run db:migrate` después de levantar PostgreSQL y antes de iniciar API/web.

## Configuración externa

OAuth y el tenant Qlik se configuran por tenant desde el wizard/administración. BigQuery/GCS, la plantilla base de automatizaciones y las plantillas Dataflow se completan después del primer login administrativo.

## Comandos de calidad

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

La persistencia activa vive en PostgreSQL; no elimines su volumen para actualizar la aplicación.
