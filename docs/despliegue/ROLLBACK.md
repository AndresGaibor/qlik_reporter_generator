# Rollback - Qlik Automate Creator

## Cuándo Hacer Rollback

- Nueva versión causa errores críticos en producción
- Migración de base de datos falla
- Problemas de compatibilidad detectados post-despliegue
- Fallo en smoke tests después de actualización

## Proceso de Rollback

### Paso 1: Evaluar el Problema

```bash
# Ver estado de servicios
docker compose -f compose.yaml ps

# Ver logs recientes
docker compose -f compose.yaml logs --tail=100

# Ejecutar smoke tests
./scripts/ops/smoke.sh
```

### Paso 2: Documentar el Problema

- Registrar hora de detección
- Documentar síntomas y errores
- Guardar logs relevantes

### Paso 3: Ejecutar Rollback

```bash
# Versión a la que queremos volver (tag Git o imagen Docker)
export CURRENT_TAG=v1.2.2

# Ejecutar rollback
CURRENT_TAG=$CURRENT_TAG ./scripts/ops/rollback.sh
```

### Paso 4: Verificar

```bash
# Verificar que servicios están arriba
docker compose -f compose.yaml ps

# Ejecutar smoke tests
./scripts/ops/smoke.sh

# Verificar logs
docker compose -f compose.yaml logs --tail=50
```

## Rollback Manual

Si el script de rollback falla:

### 1. Detener servicios actuales

```bash
docker compose -f compose.yaml stop web api
```

### 2. Restaurar versión anterior

```bash
# Usar Docker image de la versión anterior
docker pull ghcr.io/tu-repo/qlik-reportes-creator:v1.2.2

# Modificar compose.yaml temporalmente para usar la imagen anterior
# O ejecutar directamente:
docker run -d --name qlik-api-rollback \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgres://... \
  ghcr.io/tu-repo/qlik-reportes-creator:v1.2.2-api
```

### 3. Restaurar backup de DB si es necesario

```bash
# Encontrar backup antes del despliegue
ls -lt ./backups/ | grep pre_deploy

# Restaurar
./scripts/ops/restore.sh ./backups/pre_deploy_YYYYMMDD_HHMMSS.sql.gz
```

### 4. Reiniciar servicios

```bash
docker compose -f compose.yaml up -d
```

## Rollback de Base de Datos

Las migraciones Drizzle son forward-only. Si una migración causa problemas:

### Opción 1: Restore de DB

```bash
# Encontrar backup pre-migración
ls -lt ./backups/ | grep pre_

# Restaurar
./scripts/ops/restore.sh ./backups/pre_migracion_YYYYMMDD_HHMMSS.sql.gz
```

### Opción 2: Re-inicializar servicios

```bash
# Forzar re-run de migraciones no es posible (forward-only)
# Mejor restaurar desde backup
./scripts/ops/restore.sh ./backups/ultimo_backup_funcionando.sql.gz
```

## Checklist Post-Rollback

- [ ] Servicios están corriendo
- [ ] Smoke tests pasan
- [ ] Endpoints de salud responden OK
- [ ] Logs no muestran errores
- [ ] Usuarios pueden hacer login
- [ ] Funcionalidad core funciona

## Comunicar Rollback

1. Notificar al equipo (Slack, email)
2. Actualizar status page si existe
3. Documentar en incident report
4. Planificar root cause analysis
