# Qlik Reportes Creator

Aplicación para crear y ejecutar reportes basados en Qlik Dataflow. Usa PostgreSQL para persistencia interna, una API Hono y un frontend React.

## Requisitos

- Bun 1.3+
- Docker y Docker Compose

## Desarrollo local

```bash
cp .env.example .env
bun install
docker compose up -d postgres
bun run dev
```

- Frontend: `http://localhost:4525`
- API: `http://localhost:4523`
- Salud API: `http://localhost:4523/api/salud`

El `.env` usa `localhost` para que Bun se conecte a PostgreSQL desde el host. Compose usa internamente el host `postgres`; no es necesario cambiar la URL entre ambos modos.

## Docker completo

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: `http://localhost:4524`
- API: `http://localhost:4523`

Aplica el esquema inicial antes del primer arranque:

```bash
bun run db:migrate
```

## Diagnóstico

```bash
docker compose ps
docker compose logs postgres
docker compose logs api
bun run db:check
```

Si la API no conecta, espera a que PostgreSQL esté saludable antes de iniciar `bun run dev`.

## Reinicio de datos locales

Este comando elimina todos los datos de PostgreSQL:

```bash
docker compose down -v
docker compose up -d postgres
```

## Reinicio completo de una instalación existente

Esto detiene la instalación anterior, borra su base de datos y recompila los contenedores. No elimina el archivo `.env`.

```bash
docker compose down -v --remove-orphans
docker compose build --no-cache
docker compose up -d
docker compose ps
```

## Actualizar una instalación existente

Después de obtener cambios del repositorio, sincroniza las dependencias antes de arrancar. En Windows con PowerShell:

```powershell
git pull origin main
bun install --frozen-lockfile
docker compose up -d postgres
bun run dev
```

Si una versión anterior conservaba una URL con `@postgres`, reemplaza el archivo local con el ejemplo antes de iniciar Bun:

```powershell
Copy-Item .env.example .env -Force
```

`DATABASE_URL` debe usar `localhost` cuando Bun se ejecuta en el host. Si el puerto `4525` está ocupado, detén el proceso anterior antes de ejecutar `bun run dev`.

## Calidad

```bash
bun run verify
```

Incluye lint, typecheck, pruebas y build.

## Más información

- [Guía de arranque local](docs/desarrollo/guia-arranque-local.md)
- [Setup inicial](docs/setup/README.md)
- [Despliegue](docs/desarrollo/despliegue.md)
