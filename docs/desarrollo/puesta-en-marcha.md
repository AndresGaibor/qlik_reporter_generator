# Puesta en marcha

Consulta la [guia de arranque local](guia-arranque-local.md). Antes del primer arranque, ejecuta `bun run db:migrate`.

## Variables críticas

- `QLIK_TENANT_HOST`: host del tenant sin rutas.
- `QLIK_CLIENT_ID`, `QLIK_CLIENT_SECRET`, `QLIK_REDIRECT_URI`: cliente OAuth Web.
- `QLIK_OAUTH_SCOPES`: scopes permitidos por el cliente y consentidos por el usuario.
- `CIFRADO_CLAVE_PRINCIPAL`: 32 bytes codificados en Base64.
- `DATABASE_URL`: PostgreSQL, fuente de verdad.

## Comandos de calidad

```bash
bun run typecheck
bun run test
bun run lint
bun run build
```

## PostgreSQL

El esquema vigente parte de `0000_tan_zeigeist.sql`. La migración forward `0001_spooky_marvel_apes.sql` retira tablas y columnas legacy, normaliza roles a `admin | usuario` y limpia sesiones/idempotencias expiradas.

La persistencia activa incluye organizaciones, usuarios, tenants Qlik, OAuth/sesiones, configuración BigQuery, reportes, ejecuciones, auditoría e idempotencia.
