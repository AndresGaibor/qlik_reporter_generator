# Rollback

La guía general está en [LEVANTAR-DESDE-CERO.md](LEVANTAR-DESDE-CERO.md).

## Rollback de aplicación

El proyecto construye `api` y `web` desde el checkout Git; no usa un registry versionado como fuente de rollback.

```bash
CURRENT_TAG=<tag-o-commit> ./scripts/ops/rollback.sh
```

El script exige un árbol tracked limpio, resuelve el ref Git, hace un backup de PostgreSQL, cambia a un checkout detached, reconstruye `migrate/api/web`, levanta Compose y ejecuta `smoke.sh`.

Para volver después a la rama principal:

```bash
git switch main
git pull --ff-only origin main
docker compose build
docker compose up -d
./scripts/ops/smoke.sh
```

## Base de datos

Las migraciones Drizzle son forward-only. El rollback de código no revierte la DB automáticamente. Si el commit anterior no soporta el esquema actual, restaura un backup compatible de forma explícita:

```bash
docker compose stop api web
./scripts/ops/restore.sh ./backups/backup-compatible.sql.gz
docker compose up -d
./scripts/ops/smoke.sh
```

Nunca uses `down -v` como mecanismo de rollback.
