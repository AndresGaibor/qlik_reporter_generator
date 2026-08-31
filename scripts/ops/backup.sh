#!/usr/bin/env bash
# backup.sh - Backup de PostgreSQL para Qlik Automate Creator
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${CONTAINER_NAME:-qlik_reportes_creator-postgres-1}"
DB_NAME="${DB_NAME:-qlik_automatizaciones}"
DB_USER="${POSTGRES_USER:-qlik_app}"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Iniciando backup de $DB_NAME..."

docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl \
  | gzip > "$BACKUP_DIR/postgres_${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Backup completado: $BACKUP_DIR/postgres_${DB_NAME}_${TIMESTAMP}.sql.gz"

# Limpiar backups antiguos (mantener ultimos 7)
ls -t "$BACKUP_DIR"/postgres_"$DB_NAME"_*.sql.gz | tail -n +8 | xargs -r rm

echo "[$(date -Iseconds)] Backup finalizados. Archivos en $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/postgres_"$DB_NAME"_*.sql.gz | head -5
