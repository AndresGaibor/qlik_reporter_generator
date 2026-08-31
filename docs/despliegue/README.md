# Despliegue - Qlik Automate Creator

## Arquitectura

```
                    ┌─────────────────────────────────────────┐
                    │              Internet                   │
                    └──────────────┬────────────────────────┘
                                   │ :4524
                    ┌──────────────▼────────────────────────┐
                    │           Nginx (Puerto 4524)          │
                    │         Proxy reverso + hardening       │
                    └───┬────────────────────────┬──────────┘
                        │                        │
              ┌─────────▼─────────┐   ┌────────▼────────┐
              │  Web (Puerto 80)  │   │  API (Puerto 4523)│
              │   React/Vite     │   │   Bun/Hono        │
              │   Solo lectura   │   │   Interna         │
              └───────────────────┘   └────────┬─────────┘
                                               │
                                   ┌──────────▼─────────┐
                                   │  Migrate (one-shot)│
                                   │  Drizzle           │
                                   └──────────┬─────────┘
                                              │
                                   ┌──────────▼─────────┐
                                   │   PostgreSQL 17    │
                                   │  (red qlik-network)│
                                   └────────────────────┘
```

## Requisitos

- Docker y Docker Compose
- PostgreSQL 17 (via Docker)
- Bun 1.3.10+ (para desarrollo local)

## Variables de Entorno

Copia `.env.production.example` a `.env` en el servidor:

```bash
cp .env.production.example .env
```

Variables obligatorias en producción:

| Variable | Descripción |
|----------|-------------|
| `POSTGRES_PASSWORD` | Password de PostgreSQL (generar con `openssl rand -base64 32`) |
| `CIFRADO_CLAVE_PRINCIPAL` | Clave AES-256-GCM (generar con `openssl rand -base64 32`) |
| `FRONTEND_URL` | URL pública del frontend (ej: `https://tu-dominio.com`) |

## Despliegue con Docker Compose

### 1. Preparar el servidor

```bash
# Crear directorio de aplicación
mkdir -p /opt/qlik-automate-creator
cd /opt/qlik-automate-creator

# Copiar archivos (usar tu método de despliegue favorito)
scp -r user@build-server:/path/to/files/* .
```

### 2. Configurar variables de entorno

```bash
# Generar secretos seguros
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export CIFRADO_CLAVE_PRINCIPAL=$(openssl rand -base64 32)

# Editar .env
nano .env
```

### 3. Iniciar servicios

```bash
# Validar configuración
docker compose -f compose.yaml config --quiet

# Iniciar servicios
docker compose -f compose.yaml up -d

# Verificar estado
docker compose -f compose.yaml ps

# Ver logs
docker compose -f compose.yaml logs -f
```

### 4. Verificar despliegue

```bash
# Esperar a que los servicios estén healthy
sleep 30

# Ejecutar smoke tests
./scripts/ops/smoke.sh
```

## Servicios

| Servicio | Puerto interno | Descripción |
|----------|-----------------|-------------|
| `postgres` | 5432 | Base de datos PostgreSQL |
| `migrate` | - | Servicio one-shot para migraciones |
| `api` | 4523 | Backend Bun/Hono (no expuesto públicamente) |
| `web` | 80 | Frontend React (nginx) |
| `nginx` | 4524 | Proxy reverso (expuesto a internet) |

## Healthchecks

- **Liveness**: `GET /api/live` - Verifica que el proceso está vivo
- **Readiness**: `GET /api/ready` - Verifica DB y servicios conectados
- **Salud**: `GET /api/salud` - Estado general (compatibilidad)

## Backup Automático

Los backups se almacenan en `./backups/` (montar volumen persistente):

```bash
# Backup manual
./scripts/ops/backup.sh

# Restaurar
./scripts/ops/restore.sh ./backups/postgres_qlik_automatizaciones_YYYYMMDD_HHMMSS.sql.gz
```

## Actualización

```bash
# Descargar nuevas imágenes
docker compose -f compose.yaml pull

# Reiniciar con nueva versión
docker compose -f compose.yaml up -d

# Verificar
./scripts/ops/smoke.sh
```

## Rollback

```bash
# Rollback a versión anterior
CURRENT_TAG=v1.2.2 ./scripts/ops/rollback.sh
```

## Permisos

```bash
# Crear usuario de aplicación (opcional)
sudo useradd -r -s /bin/false qlikapp

# Asignar permisos
sudo chown -R qlikapp:qlikapp /opt/qlik-automate-creator
sudo chmod -R 755 /opt/qlik-automate-creator
```

## Seguridad

- Red interna `qlik-network` (no accesible desde outside)
- Headers de seguridad en Nginx
- No exponer puertos de DB o API
- Secrets en variables de entorno, no en archivos commitidos
- Rate limiting en Nginx
- CSP headers strict
