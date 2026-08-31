# Despliegue

## Documentos autoritativos

1. [Despliegue limpio desde cero](LEVANTAR-DESDE-CERO.md) — runbook completo.
2. [Checklist de producción](CHECKLIST-PRODUCCION.md) — go/no-go durante la ventana.
3. [Backup y restore](BACKUP_RESTORE.md) — recuperación de datos.
4. [Rollback](ROLLBACK.md) — volver a un commit/tag.
5. [Secretos](SECRETOS.md) — claves y credenciales.
6. [Observabilidad](OBSERVABILIDAD.md) — healthchecks y logs realmente disponibles.
7. [Cloudflare Tunnel](CLOUDFLARE-TUNNEL.md) — instalación y servicio systemd.

No uses documentación histórica para decidir puertos, callback OAuth, migraciones o estrategia de cifrado. `compose.yaml`, `Dockerfile`, `scripts/ops/` y el runbook canónico son la fuente de verdad.

### Regla OAuth de producción

Para `FRONTEND_URL=https://dominio`, el callback es:

```text
https://dominio/api/auth/qlik/callback
```

Si aparece `localhost:4523` en un callback de producción, el despliegue/configuración está mal y debe corregirse antes de reutilizar el login.
