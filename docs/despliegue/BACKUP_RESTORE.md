# Backup y Restore - Qlik Automate Creator

## Backup Automático

El script `scripts/ops/backup.sh` realiza:

1. Dump completo de PostgreSQL con `pg_dump`
2. Compresión con gzip
3. Rotación automática (mantiene últimos 7 backups)

### Uso

```bash
# Backup con configuración por defecto
./scripts/ops/backup.sh

# Backup con variables personalizadas
BACKUP_DIR=/mnt/backups CONTAINER_NAME=mi-postgres ./scripts/ops/backup.sh
```

### Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `BACKUP_DIR` | `./backups` | Directorio para almacenar backups |
| `CONTAINER_NAME` | `qlik_reportes_creator-postgres-1` | Nombre del contenedor PostgreSQL |
| `DB_NAME` | `qlik_automatizaciones` | Nombre de la base de datos |

### Programar Backups con Cron

```bash
# Editar crontab
crontab -e

# Agregar línea para backup diario a las 2am
0 2 * * * /opt/qlik-automate-creator/scripts/ops/backup.sh >> /var/log/backup.log 2>&1
```

## Restore

El script `scripts/ops/restore.sh` realiza:

1. Backup del estado actual antes de restaurar
2. Verificación de integridad del archivo gzip
3. Terminación de conexiones activas a la DB
4. Drop y recreate de la base de datos
5. Restauración del dump

### Uso

```bash
# Restaurar desde un archivo de backup
./scripts/ops/restore.sh ./backups/postgres_qlik_automatizaciones_20250831_120000.sql.gz
```

### Restauración Paso a Paso

Si prefieres hacer la restauración manualmente:

```bash
# 1. Verificar que el archivo es válido
gzip -t ./backups/archivo.sql.gz

# 2. Hacer backup del estado actual (por seguridad)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec qlik_reportes_creator-postgres-1 pg_dump -U qlik_app -d qlik_automatizaciones \
  | gzip > ./backups/pre_restore_${TIMESTAMP}.sql.gz

# 3. Terminar conexiones activas
docker exec qlik_reportes_creator-postgres-1 psql -U qlik_app -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'qlik_automatizaciones';"

# 4. Drop y recreate
docker exec qlik_reportes_creator-postgres-1 psql -U qlik_app -d postgres -c \
  "DROP DATABASE IF EXISTS qlik_automatizaciones; CREATE DATABASE qlik_automatizaciones;"

# 5. Restaurar
gunzip -c ./backups/archivo.sql.gz | docker exec -i qlik_reportes_creator-postgres-1 \
  psql -U qlik_app -d qlik_automatizaciones
```

## Verificar Integridad del Backup

```bash
# Listar backups disponibles
ls -lh ./backups/

# Ver contenido de un backup sin restaurar
gunzip -c ./backups/archivo.sql.gz | head -20

# Verificar sintaxis SQL
gunzip -c ./backups/archivo.sql.gz | grep -E "^(CREATE|INSERT)" | head -5
```

## Disaster Recovery Plan

### Escenario: Pérdida total de datos

1. Detener servicios
   ```bash
   docker compose -f compose.yaml stop api web
   ```

2. Restaurar desde backup
   ```bash
   ./scripts/ops/restore.sh ./backups/postgres_qlik_automatizaciones_ULTIMO.sql.gz
   ```

3. Reiniciar servicios
   ```bash
   docker compose -f compose.yaml start api web
   ```

4. Verificar
   ```bash
   ./scripts/ops/smoke.sh
   ```

### Escenario: Corrupción de datos específica

1. Identificar momento del problema (logs)
2. Encontrar backup más reciente antes del problema
3. Restaurar a ese punto

## Políticas de Retención

- Backups diarios: mantener 7 días
- Backups semanales: mantener 4 semanas
- Backups mensuales: mantener 12 meses
- Backups anuales: mantener 7 años

Configurar en cron o sistema de backup externo.
