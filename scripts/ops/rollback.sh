#!/usr/bin/env bash
# rollback.sh - Rollback del checkout Git y reconstruccion de la aplicacion
set -euo pipefail

set -a
[ -f .env ] && source .env
set +a

COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
CURRENT_TAG="${CURRENT_TAG:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_NAME="${DB_NAME:-qlik_automatizaciones}"
DB_USER="${POSTGRES_USER:-qlik_app}"

if [ -z "$CURRENT_TAG" ]; then
  echo "Error: CURRENT_TAG no esta definido"
  echo "Uso: CURRENT_TAG=<tag-o-commit> $0"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: hay cambios tracked sin commit; abortando rollback"
  exit 1
fi

git fetch --tags origin
TARGET_COMMIT=$(git rev-parse --verify "${CURRENT_TAG}^{commit}")
echo "[$(date -Iseconds)] Rollback de aplicacion a $CURRENT_TAG ($TARGET_COMMIT)..."

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
POSTGRES_CONTAINER=$(docker compose -f "$COMPOSE_FILE" ps -q postgres 2>/dev/null || true)
if [ -n "$POSTGRES_CONTAINER" ]; then
  echo "[$(date -Iseconds)] Backup de seguridad de DB..."
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-acl | gzip > "$BACKUP_DIR/pre_rollback_${TIMESTAMP}.sql.gz"
fi

git checkout --detach "$TARGET_COMMIT"
docker compose -f "$COMPOSE_FILE" build migrate api web
docker compose -f "$COMPOSE_FILE" up -d

echo "[$(date -Iseconds)] Verificando rollback..."
./scripts/ops/smoke.sh
docker compose -f "$COMPOSE_FILE" ps

echo "[$(date -Iseconds)] Aplicacion en $TARGET_COMMIT."
echo "La base de datos NO fue revertida automaticamente; usa restore.sh solo si el esquema lo requiere."
