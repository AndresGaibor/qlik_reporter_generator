# Despliegue

## Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

El frontend queda en el puerto configurado por `PORT_WEB` (4524 por defecto) y la API en `PORT_API` (4523 por defecto). PostgreSQL solo se expone en el host configurado por `HOST_IP`.

La API crea el esquema desde `apps/api/sql/esquema-base.sql` cuando la base está vacía. No ejecutes migraciones Drizzle ni `db:migrate`.

## Actualización

```bash
git pull
docker compose up --build -d
```

## Diagnóstico

```bash
docker compose ps
docker compose logs api
docker compose logs postgres
```

Para reiniciar datos de desarrollo de forma destructiva:

```bash
docker compose down -v
docker compose up -d postgres
```
