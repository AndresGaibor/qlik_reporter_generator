# Puesta en marcha

Consulta la [guia de arranque local](guia-arranque-local.md). El esquema se crea automaticamente al iniciar la API; no hay migraciones que ejecutar.

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

La migración `0001_arquitectura_modular.sql` incorpora:

- `solicitudes_idempotentes`
- `eventos_outbox`

La auditoría reutiliza `auditoria_eventos`.
