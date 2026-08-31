# Gestión de Secretos - Qlik Automate Creator

## Principios

1. **Nunca hacer commit de secretos** - Usar .gitignore
2. **Rotación periódica** - Cambiar secretos cada 90 días
3. **Mínimo privilegio** - Solo servicios necesarios tienen acceso
4. **Auditoría** - Registrar acceso a secretos

## Secretos Requeridos

### 1. POSTGRES_PASSWORD

Contraseña de PostgreSQL.

```bash
# Generar
openssl rand -base64 32

# Requisitos:
# - Mínimo 32 caracteres
# - Aleatorio (no predecible)
# - Almacenado en .env o sistema de secretos
```

### 2. CIFRADO_CLAVE_PRINCIPAL

Clave AES-256-GCM para cifrar secretos en la base de datos.

```bash
# Generar
openssl rand -base64 32

# IMPORTANTE:
# - Si se pierde, los datos cifrados en DB son irrecuperables
# - Hacer backup de esta clave en lugar seguro
```

### 3. QLIK_CLIENT_SECRET

Client secret de OAuth Qlik.

```bash
# Obtener del portal de Qlik
# Formato: típico UUID o string largo
```

## Almacenamiento de Secretos

### Opción 1: Variables de Entorno (Desarrollo)

```bash
# .env (NO committing este archivo)
POSTGRES_PASSWORD=mi_password_seguro
CIFRADO_CLAVE_PRINCIPAL=mi_clave_de_32_bytes
```

### Opción 2: Docker Secrets (Swarm)

```yaml
# docker-compose.prod.yml
services:
  api:
    secrets:
      - postgres_password
      - cifrado_clave
secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  cifrado_clave:
    file: ./secrets/cifrado_clave.txt
```

### Opción 3: Sistema Externo (Producción)

- HashiCorp Vault
- AWS Secrets Manager
- Google Secret Manager
- Azure Key Vault

```bash
# Ejemplo con Vault
vault kv get -field=postgres_password secret/qlik/automate
```

## Rotación de Secretos

### ROTACIÓN POSTGRES_PASSWORD

```bash
# 1. Generar nuevo password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Actualizar en PostgreSQL
docker exec qlik_reportes_creator-postgres-1 psql -U qlik_app -d postgres \
  -c "ALTER USER qlik_app WITH PASSWORD '$NEW_PASSWORD';"

# 3. Actualizar .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PASSWORD/" .env

# 4. Reiniciar servicios
docker compose -f compose.yaml restart api
```

### ROTACIÓN CIFRADO_CLAVE_PRINCIPAL

**ADVERTENCIA**: Este cambio requiere recifrado de datos existentes.

```bash
# 1. Backup de la base de datos
./scripts/ops/backup.sh

# 2. Generar nueva clave
NEW_KEY=$(openssl rand -base64 32)

# 3. La aplicación migrará automáticamente al reiniciar
# (requiere implementar lógica de recifrado si es crítico)

# 4. Actualizar .env
sed -i "s/CIFRADO_CLAVE_PRINCIPAL=.*/CIFRADO_CLAVE_PRINCIPAL=$NEW_KEY/" .env

# 5. Reiniciar
docker compose -f compose.yaml restart api
```

## Escaneo de Secretos

Ejecutar regularmente:

```bash
./scripts/ops/secret-scan.sh
```

## Lista Negra de Secretos (si se comprometen)

Si un secreto se filtra:

1. **Rotar inmediatamente** el secreto comprometido
2. **Revocar** acceso si es posible (OAuth tokens, API keys)
3. **Auditar** logs de acceso
4. **Notificar** si hay datos de usuarios afectados
5. **Documentar** el incidente

## Permisos de Archivos

```bash
# .env debe tener permisos restrictivos
chmod 600 .env

# Directory de secretos
chmod 700 ./secrets

# Archivos de secretos
chmod 600 ./secrets/*
```
