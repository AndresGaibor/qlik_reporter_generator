#!/usr/bin/env bash
# restore.sh - Restore de PostgreSQL para Qlik Automate Creator
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo_backup.sql.gz>"
  echo "Ejemplo: $0 ./backups/postgres_qlik_automatizaciones_20250831_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${CONTAINER_NAME:-qlik_reportes_creator-postgres-1}"
DB_NAME="${DB_NAME:-qlik_automatizaciones}"
DB_USER="${POSTGRES_USER:-qlik_app}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Archivo de backup no encontrado: $BACKUP_FILE"
  exit 1
fi

echo "[$(date -Iseconds)] Iniciando restore de $BACKUP_FILE a $DB_NAME..."

# Verificar que el backup es valido
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "Error: El archivo de backup esta corrupto o no es un gzip valido"
  exit 1
fi

# Hacer backup del estado actual antes de restaurar
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-acl \
  | gzip > "$BACKUP_DIR/pre_restore_${TIMESTAMP}.sql.gz"
echo "[$(date -Iseconds)] Backup pre-restore guardado"

# Terminar conexiones activas
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  || true

# Drop y recreate database
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS $DB_NAME;"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c \
  "CREATE DATABASE $DB_NAME;"

# Restaurar
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"

echo "[$(date -Iseconds)] Restore completado exitosamente"
