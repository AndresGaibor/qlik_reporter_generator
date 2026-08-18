# Esquema Base y Arranque Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar las migraciones acumuladas y conseguir que el desarrollo local funcione de forma reproducible con PostgreSQL en Docker y Bun en el host.

**Architecture:** Un archivo SQL idempotente define el estado completo de PostgreSQL y la API lo aplica antes de atender peticiones. Drizzle conserva el esquema TypeScript para los repositorios, mientras Compose inyecta una URL de base interna distinta de la URL de host que usa Bun.

**Tech Stack:** Bun, TypeScript, PostgreSQL 17, Drizzle ORM, Docker Compose, Biome.

**Spec:** `docs/superpowers/specs/2026-08-18-esquema-base-y-arranque-local-design.md`

## Global Constraints

- No preservar datos ni historial de las migraciones existentes.
- No mostrar ni reemplazar secretos de `.env`; conservar valores de variables que sigan soportadas.
- El SQL base debe ser idempotente y representar las 19 tablas finales.
- No instalar, actualizar ni eliminar dependencias.
- No hacer commits ni despliegues.

---

### Task 1: Probar el contrato del esquema base

**Files:**
- Modify: `apps/api/src/esquema.test.ts`
- Test: `apps/api/src/esquema.test.ts`

**Interfaces:**
- Consumes: `apps/api/src/plataforma/persistencia/esquema.ts` y `apps/api/sql/esquema-base.sql`.
- Produces: pruebas que detectan ausencia de tablas, restricciones o índices finales en el SQL base.

- [ ] **Step 1: Escribir pruebas fallidas para el SQL único**

Sustituir las pruebas que leen `drizzle/0009_secretos_destino_impala.sql` y `drizzle/0014_ejecuciones_reportes_dataflow.sql` por una lectura de `../../sql/esquema-base.sql`. Verificar que contiene, como mínimo, las tablas `app_config`, `conexiones_destino`, `ejecuciones_reportes` y `eventos_outbox`, y las restricciones finales:

```ts
expect(contenido).toContain('CREATE TABLE IF NOT EXISTS "conexiones_destino"');
expect(contenido).toContain('CHECK ("tipo" = \'bigquery\')');
expect(contenido).toContain('CREATE TABLE IF NOT EXISTS "ejecuciones_reportes"');
expect(contenido).toContain('CHECK ("tipo_ejecucion" = \'manual\')');
expect(contenido).not.toContain('programaciones_automatizacion');
```

- [ ] **Step 2: Ejecutar la prueba para comprobar el fallo**

Run: `bun test apps/api/src/esquema.test.ts`

Expected: falla porque `apps/api/sql/esquema-base.sql` aún no existe.

- [ ] **Step 3: Añadir un test de bootstrap de esquema**

Extraer la ruta y lectura del SQL base desde `conexion.ts` a una función exportada:

```ts
export function obtenerEsquemaBase(): string
```

Probar que devuelve el contenido del SQL base y que no depende del directorio de trabajo actual.

- [ ] **Step 4: Ejecutar la prueba para comprobar el fallo esperado**

Run: `bun test apps/api/src/esquema.test.ts`

Expected: falla porque `obtenerEsquemaBase` no existe.

### Task 2: Consolidar las migraciones en un esquema idempotente

**Files:**
- Create: `apps/api/sql/esquema-base.sql`
- Delete: `apps/api/drizzle/`
- Modify: `apps/api/src/plataforma/persistencia/conexion.ts`
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Modify: `apps/api/src/esquema.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: las 16 migraciones actuales y el contrato de tablas Drizzle.
- Produces: `obtenerEsquemaBase(): string` y `asegurarEsquemaTablas(): Promise<void>` que aplican un único SQL.

- [ ] **Step 1: Crear el SQL con el estado final**

Crear `apps/api/sql/esquema-base.sql` con `CREATE TABLE IF NOT EXISTS`, `DO $$ ... duplicate_object ... $$` para FKs y `CREATE [UNIQUE] INDEX IF NOT EXISTS`. Debe crear solo estas tablas:

```text
organizaciones, usuarios, membresias_organizacion, tenants_qlik,
configuraciones_oauth_qlik, identidades_qlik, credenciales_qlik,
sesiones_usuario, intentos_oauth_qlik, configuraciones_automatizacion,
ejecuciones_reportes, auditoria_eventos, espacios_qlik_cache,
flujos_qlik_cache, automatizaciones_qlik_cache, app_config,
solicitudes_idempotentes, conexiones_destino, eventos_outbox
```

Incluir los checks definitivos `conexiones_destino.tipo = 'bigquery'` y `ejecuciones_reportes.tipo_ejecucion = 'manual'`, el índice parcial `uq_conexion_bigquery_predeterminada_tenant`, el índice parcial `idx_conexiones_tenant` y todas las FKs e índices declarados en `esquema.ts`.

- [ ] **Step 2: Implementar el bootstrap único**

En `conexion.ts`, eliminar la lectura de directorio, el ordenamiento de archivos, el lock y los `console.log` de migraciones. Usar una ruta resuelta desde el módulo para que funcione en Bun y en el build Node:

```ts
const rutaEsquemaBase = fileURLToPath(
  new URL("../../../sql/esquema-base.sql", import.meta.url),
);

export function obtenerEsquemaBase(): string {
  return readFileSync(rutaEsquemaBase, "utf8");
}

export async function asegurarEsquemaTablas(): Promise<void> {
  await db.execute(sql`SET client_min_messages = 'WARNING'`);
  await db.execute(sql.raw(obtenerEsquemaBase()));
}
```

Eliminar los `CREATE` y `ALTER` especiales de `asegurarEsquemaTablas`, pues deben estar en el SQL base.

- [ ] **Step 3: Alinear Drizzle y artefactos**

En `esquema.ts`, añadir al modelo `conexionesDestino` el check de tipo `bigquery`, el check de estados finales y los índices parciales que estén en el SQL. Eliminar el directorio `apps/api/drizzle`, los scripts `db:generate`, `db:migrate` y `db:push`, y los aliases raíz correspondientes. Actualizar el Dockerfile para copiar `apps/api/sql` a `/app/sql` junto a `dist`.

- [ ] **Step 4: Ejecutar pruebas de contrato**

Run: `bun test apps/api/src/esquema.test.ts`

Expected: PASS.

### Task 3: Corregir la configuración de host y Compose

**Files:**
- Modify: `.env.example`
- Modify: `.env`
- Modify: `.env.production`
- Modify: `compose.yaml`
- Modify: `tests/task-1.1-root-config.test.ts`

**Interfaces:**
- Consumes: `apps/api/src/plataforma/configuracion/entorno.ts`, Compose y scripts de Bun.
- Produces: un `.env` apto para Bun local y una URL interna inyectada por Compose.

- [ ] **Step 1: Escribir pruebas fallidas de variables soportadas**

Actualizar la prueba de configuración para comprobar que `.env.example` incluye `PORT_WEB`, `PORT_API`, `HOST_IP`, `DATABASE_URL`, `FRONTEND_URL`, `QLIK_OAUTH_TIMEOUT_MS` y `GOOGLE_SIGNED_URL_MINUTOS`; y que no incluye `SERVER_NAME` ni `REMOTE_API_URL`.

- [ ] **Step 2: Ejecutar la prueba para comprobar el fallo**

Run: `bun test tests/task-1.1-root-config.test.ts`

Expected: falla mientras las variables obsoletas sigan presentes.

- [ ] **Step 3: Reducir y separar la configuración**

Configurar `DATABASE_URL` de `.env.example` y `.env` con `localhost:5432`. Mantener `POSTGRES_USER` y `POSTGRES_PASSWORD` como personalizaciones de Compose. En `compose.yaml`, definir la URL de API con host fijo `postgres` y credenciales interpoladas:

```yaml
DATABASE_URL: postgres://${POSTGRES_USER:-qlik_app}:${POSTGRES_PASSWORD:-cambiar_en_produccion}@postgres:5432/qlik_automatizaciones
```

Eliminar variables sin consumidor de `.env`, `.env.example` y `.env.production`; conservar las variables Qlik, cifrado y bootstrap solo como opcionales cuando los consumidores existan. No alterar sus valores secretos.

- [ ] **Step 4: Verificar configuración y prueba**

Run: `bun test tests/task-1.1-root-config.test.ts && docker compose config --quiet`

Expected: PASS y salida vacía.

### Task 4: Reemplazar la documentación operativa

**Files:**
- Create: `docs/desarrollo/guia-arranque-local.md`
- Modify: `README.md`
- Modify: `docs/desarrollo/puesta-en-marcha.md`
- Modify: `docs/setup/README.md`
- Modify: `docs/desarrollo/despliegue.md`

**Interfaces:**
- Consumes: scripts de `package.json`, `compose.yaml` y el esquema base.
- Produces: instrucciones únicas para desarrollo local y Docker completo.

- [ ] **Step 1: Crear la guía operativa**

Documentar exactamente estos flujos:

```bash
cp .env.example .env
bun install
docker compose up -d postgres
bun run dev
```

```bash
docker compose up --build
```

Incluir verificaciones con `docker compose ps`, `docker compose logs postgres`, `bun run db:check`, `http://localhost:4525` y `http://localhost:4523/api/salud`.

- [ ] **Step 2: Documentar recuperación explícita**

Incluir el reinicio para datos de desarrollo, marcado como destructivo:

```bash
docker compose down -v
docker compose up -d postgres
```

Explicar que no existe `db:migrate`, porque la API aplica `esquema-base.sql` automáticamente.

- [ ] **Step 3: Retirar instrucciones contradictorias**

Cambiar o enlazar las guías antiguas para que no indiquen `drizzle-kit migrate`, valores de puerto obsoletos ni una conexión a `postgres` desde Bun local.

- [ ] **Step 4: Verificar las referencias**

Run: `grep -R "db:migrate\|drizzle-kit migrate" README.md docs/desarrollo docs/setup`

Expected: sin resultados, salvo documentación histórica marcada explícitamente como tal.

### Task 5: Verificar desde cero

**Files:**
- Modify: archivos solo si las verificaciones revelan una discrepancia con el plan.

**Interfaces:**
- Consumes: esquema base, Compose, configuración y guía final.
- Produces: evidencia de que los dos modos de inicio son reproducibles.

- [ ] **Step 1: Formatear los archivos modificados**

Run: `bunx biome format --write apps/api/src/plataforma/persistencia/conexion.ts apps/api/src/plataforma/persistencia/esquema.ts apps/api/src/esquema.test.ts tests/task-1.1-root-config.test.ts`

- [ ] **Step 2: Ejecutar la suite de calidad**

Run: `bun run verify`

Expected: PASS.

- [ ] **Step 3: Verificar el modo desarrollo desde una base nueva**

Run: `docker compose down -v && docker compose up -d postgres && bun run dev:api`

Expected: PostgreSQL sano, la API inicia sin mensajes de migraciones ni errores de conexión y `/api/salud` responde correctamente.

- [ ] **Step 4: Verificar el modo Docker completo**

Run: `docker compose down -v && docker compose up --build -d && docker compose ps`

Expected: `postgres`, `api` y `web` quedan saludables.
