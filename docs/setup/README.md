# Configuración inicial

Para producción usa la guía canónica: [Levantar desde cero](../despliegue/LEVANTAR-DESDE-CERO.md).

## Docker Compose

```bash
cp .env.production.example .env
# configura FRONTEND_URL, POSTGRES_PASSWORD y CIFRADO_CLAVE_PRINCIPAL
docker compose up -d --build
```

En este modo `migrate` aplica las migraciones antes de arrancar el API. No ejecutes `bun run db:migrate` adicionalmente.

## Desarrollo local con Bun

Consulta [Guía de arranque local](../desarrollo/guia-arranque-local.md). En ese flujo PostgreSQL se levanta con Docker y las migraciones se ejecutan desde el host con `bun run db:migrate`.

## Wizard

El wizard crea la organización, registra el tenant y OAuth de Qlik y define el superadministrador. La URL pública debe coincidir con `FRONTEND_URL` para que el callback OAuth permanezca en el mismo origen.
