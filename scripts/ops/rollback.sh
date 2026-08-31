#!/usr/bin/env bash
# rollback.sh - Rollback de la aplicacion a una version anterior
set -euo pipefail

set -a
[ -f .env ] && source .env
set +a

APP_DIR="${APP_DIR:-/opt/qlik-automate-creator}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yaml}"
CURRENT_TAG="${CURRENT_TAG:-}"

if [ -z "$CURRENT_TAG" ]; then
  echo "Error: CURRENT_TAG no esta definido"
  echo "Uso: CURRENT_TAG=v1.2.3 $0"
  exit 1
fi

echo "[$(date -Iseconds)] Iniciando rollback a $CURRENT_TAG..."

# Backup de la DB actual
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

if docker ps --format '{{.Names}}' | grep -q "postgres"; then
  CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep postgres | head -1)
  DB_NAME="${DB_NAME:-qlik_automatizaciones}"
  echo "[$(date -Iseconds)] Backup de seguridad de DB..."
  docker exec "$CONTAINER_NAME" pg_dump -U qlik_app -d "$DB_NAME" \
    --no-owner --no-acl \
    | gzip > "$BACKUP_DIR/pre_rollback_${TIMESTAMP}.sql.gz"
fi

# Descargar imagenes de la version objetivo
echo "[$(date -Iseconds)] Descargando imagenes de $CURRENT_TAG..."

# Guardar estado actual por si falla
docker compose -f "$COMPOSE_FILE" pull web
docker compose -f "$COMPOSE_FILE" pull api

# Reiniciar con la version actual (que ya deberia tener las imagenes descargadas)
echo "[$(date -Iseconds)] Reiniciando servicios..."
docker compose -f "$COMPOSE_FILE" stop web api
docker compose -f "$COMPOSE_FILE" up -d

echo "[$(date -Iseconds)] Rollback completado. Verificando salud..."
sleep 10
docker compose -f "$COMPOSE_FILE" ps

# Verificar que los servicios estan healthy
for service in web api; do
  status=$(docker inspect --format='{{.State.Health.Status}}' "${APP_DIR##*/}_${service}-1" 2>/dev/null || echo "none")
  if [ "$status" = "healthy" ] || [ "$status" = "none" ]; then
    echo "[$(date -Iseconds)] $service: OK"
  else
    echo "[$(date -Iseconds)] $service: FALLO - Status: $status"
    exit 1
  fi
done

echo "[$(date -Iseconds)] Rollback a $CURRENT_TAG completado exitosamente"
