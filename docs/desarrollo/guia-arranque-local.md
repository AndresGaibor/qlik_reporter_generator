# Guia de Arranque Local

## Desarrollo con Bun

```bash
cp .env.example .env
bun install
docker compose up -d postgres
bun run dev
```

Abre `http://localhost:4525`. La API escucha en `http://localhost:4523` y su salud se comprueba en `http://localhost:4523/api/salud`.

La API crea el esquema desde `apps/api/sql/esquema-base.sql` cuando PostgreSQL esta vacio. No ejecutes `db:migrate`.

## Docker Completo

```bash
docker compose up --build
```

Compose usa el host interno `postgres`; Bun en el host usa `localhost`. No cambies `DATABASE_URL` entre ambos modos.

## Diagnostico

```bash
docker compose ps
docker compose logs postgres
docker compose logs api
bun run db:check
```

Si la API no conecta, confirma que el servicio `postgres` este saludable antes de iniciar Bun.

## Reinicio de Datos

Este comando elimina todos los datos locales de PostgreSQL:

```bash
docker compose down -v
docker compose up -d postgres
```

## Reinicio Completo

Para sustituir una instalación anterior y crear la base desde cero, ejecuta lo siguiente. Elimina todos los datos de PostgreSQL, pero conserva `.env`:

```bash
docker compose down -v --remove-orphans
docker compose build --no-cache
docker compose up -d
docker compose ps
```
