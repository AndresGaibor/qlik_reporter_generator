# Qlik + Google Cloud Cleanup and Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar `qlik_reportes_creator` con integraciones externas directas únicamente a Qlik Cloud y Google Cloud, reparar Dataflows, eliminar toda programación propia y añadir `/descargas` sobre los archivos GCS generados por cada ejecución.

**Architecture:** PostgreSQL continúa como persistencia interna. Qlik Cloud aporta OAuth, Dataflows y Qlik Automate; Google Cloud aporta BigQuery y Cloud Storage. Talend permanece downstream de Qlik Automate, sin cliente ni API directa desde esta aplicación.

**Tech Stack:** Bun, Node.js, TypeScript, Hono, React, TanStack Query/Router, PostgreSQL, Drizzle ORM, Zod, `@google-cloud/bigquery`, `@google-cloud/storage`, Vitest, Bun test, Biome.

## Global Constraints

- Solo integraciones externas directas con Qlik Cloud y Google Cloud.
- PostgreSQL interno se conserva.
- Talend no tiene cliente ni credenciales en esta aplicación.
- Todas las ejecuciones de reportes son manuales y pasan por `qlik_reportes_creator`.
- Qlik Automate se mantiene con `schedules: []`.
- Los Dataflows ejecutables solo pueden depender de fuentes BigQuery soportadas por el compilador.
- Destino fijo: `gs://bkt_dwh/POCs/TalendDescargados/`.
- No reescribir migraciones históricas ya aplicadas; limpiar hacia adelante con una migración nueva.
- No introducir Impala, Spark, SFTP, JDBC genérico, PostgreSQL externo ni APIs remotas propias en código activo.

---

## File Structure
### Dataflows

- `apps/api/src/app.ts`: montar `/api/flujos` con el `resolverQlik` activo.
- `apps/api/src/modulos/flujos/http/rutas.ts`: conservar listado/script y eliminar catálogo Spark.
- `apps/web/src/app/router.tsx`: montar `crearRutasFlujos`.
- `apps/web/src/app/navegacion.ts`: añadir Dataflows.
- `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`: consumir `modulos/flujos/api.ts`.
- `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`: consumir el mismo cliente de flujos.

### Ejecución manual

- `packages/contratos/src/reportes/dataflow.ts` y `packages/contratos/src/automatizaciones/panel.ts`: eliminar cron/programación y `programada`.
- `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`: persistir siempre `manual`.
- `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`: eliminar programación.
- `apps/api/src/entradas/{bun,node}.ts`: eliminar scheduler.
- Eliminar archivos `bucle-programador*`, `programacion-reporte*`, `programador-reportes*`, `crear-programador-reportes.ts` y `resolver-contexto-programado-postgres*`.

### Google Cloud y descargas

- Crear `apps/api/src/modulos/descargas/` con puerto, servicio, cliente GCS y rutas HTTP.
- Crear `packages/contratos/src/descargas/index.ts`.
- Crear `apps/web/src/modulos/descargas/` con página, API y descarga múltiple.
- Añadir `@google-cloud/storage`; reutilizar la cuenta de servicio BigQuery configurada para la organización/tenant.

### Limpieza legacy
- Eliminar `apps/api/src/modulos/origenes/`.
- Eliminar `generador-catalogo-spark*` y UI/endpoint asociados.
- Eliminar `ClientePostgres`, `ClienteSftp`, sus tipos y dependencias.
- Reducir `destinos` a BigQuery.
- Eliminar campos tenant `destinoApiUrl`, `destinoApiKeyCifrada`, `destinoBaseDatos` y contratos/API administrativos asociados.
- Eliminar `REMOTE_API_URL` y `REMOTE_API_KEY` del entorno.
- Nueva migración: eliminar `programaciones_automatizacion`, `conexiones_origen`, `destinos_cache`, columnas legacy y restringir `conexiones_destino.tipo` a `bigquery`.

---

### Task 1: Restaurar Dataflows end-to-end

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modulos/flujos/http/rutas.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/navegacion.ts`
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/api.ts`
- Test: `apps/api/src/app.test.ts`
- Test: `apps/web/src/app/navegacion.test.ts`
- Test: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.test.tsx`

**Interfaces:**
- Consumes: `crearRutasFlujos`, `ConsultaFlujosQlik`, `obtenerFlujosConFiltros` de `modulos/flujos/api.ts`.
- Produces: `GET /api/flujos`, `/flujos`, `/flujos/$id` y un único cliente frontend de Dataflows.
- [ ] **Step 1: Escribir pruebas rojas de montaje y cliente único**

```ts
const respuesta = await app.request("/api/flujos");
expect(respuesta.status).toBe(200);
expect(await respuesta.json()).toMatchObject({
  exito: true,
  datos: [{ id: "flow-1", nombre: "Ventas Comercial" }],
});

expect(NAVEGACION.some((item) => item.to === "/flujos")).toBe(true);
```

En `pagina-nueva-automatizacion.test.tsx`, mockear `@/modulos/flujos/api`, no `obtenerFlujosConFiltros` desde `./api`.

- [ ] **Step 2: Ejecutar tests y confirmar rojo**

Run:
```bash
bun test apps/api/src/app.test.ts
cd apps/web && bunx vitest run src/app/navegacion.test.ts src/modulos/reportes/pagina-nueva-automatizacion.test.tsx
```
Expected: `/api/flujos` 404, navegación sin `/flujos` y/o import del cliente viejo.

- [ ] **Step 3: Montar rutas y unificar imports**

En `app.ts`:
```ts
aplicacion.route(
  "/api/flujos",
  crearRutasFlujos(
    async (c) => new ConsultaFlujosQlik(await resolverQlik(c)),
    resolverQlik,
  ),
);
```
En `router.tsx` añadir `...crearRutasFlujos(rutaRaiz)` y en navegación añadir `{ to: "/flujos", etiqueta: "Dataflows", icono: "flow" }`.

En páginas de reportes:
```ts
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
```
Eliminar la función duplicada de `modulos/reportes/api.ts`.

- [ ] **Step 4: Mostrar el error real de Qlik**

Importar `extraerMensajeError` desde `@/modulos/reportes/utiles-presentacion-reporte` y usar `extraerMensajeError(errorFlujosDetalle)` en lugar del texto fijo “No se pudieron cargar los Dataflows de Qlik”. Cubrir con un test donde la API rechaza con `Sesión requerida`.

- [ ] **Step 5: Ejecutar tests verdes y typecheck**

```bash
bun test apps/api/src/app.test.ts
cd apps/web && bunx vitest run src/app/navegacion.test.ts src/modulos/reportes/pagina-nueva-automatizacion.test.tsx
after=../..; cd "$after" && bun --cwd apps/api run typecheck && bun --cwd apps/web run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/web/src/app apps/web/src/modulos/reportes apps/web/src/modulos/flujos
git commit -m "fix: restaurar dataflows en reportes"
```

---

### Task 2: Eliminar programación de contratos, UI y runtime

**Files:**
- Modify: `packages/contratos/src/reportes/dataflow.ts`
- Modify: `packages/contratos/src/reportes/dataflow.test.ts`
- Modify: `packages/contratos/src/automatizaciones/panel.ts`
- Modify: `packages/contratos/src/automatizaciones/panel-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.ts`
- Modify: `apps/api/src/modulos/automatizaciones/http/rutas-panel.test.ts`
- Modify: `apps/api/src/modulos/autenticacion-qlik/aplicacion/puertos/puerto-oauth-qlik.ts`
- Modify: `apps/api/src/modulos/autenticacion-qlik/infraestructura/cliente-oauth-qlik.ts`
- Modify: `apps/api/src/modulos/autenticacion-qlik/infraestructura/cliente-oauth-qlik.test.ts`
- Modify: `apps/api/src/entradas/bun.ts`
- Modify: `apps/api/src/entradas/node.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-dataflow.test.tsx`
- Delete: `apps/api/src/modulos/reportes/aplicacion/bucle-programador.ts`
- Delete: `apps/api/src/modulos/reportes/aplicacion/bucle-programador.test.ts`
- Delete: `apps/api/src/modulos/reportes/aplicacion/programacion-reporte.ts`
- Delete: `apps/api/src/modulos/reportes/aplicacion/programacion-reporte.test.ts`
- Delete: `apps/api/src/modulos/reportes/aplicacion/programador-reportes.ts`
- Delete: `apps/api/src/modulos/reportes/aplicacion/programador-reportes.test.ts`
- Delete: `apps/api/src/modulos/reportes/infraestructura/crear-programador-reportes.ts`
- Delete: `apps/api/src/modulos/reportes/infraestructura/resolver-contexto-programado-postgres.ts`
- Delete: `apps/api/src/modulos/reportes/infraestructura/resolver-contexto-programado-postgres.test.ts`
- Delete: `apps/api/src/entradas/programador-reportes-runtime.test.ts`

**Interfaces:**
- Consumes: ejecución manual existente y `schedules: []` de Qlik Automate.
- Produces: contratos sin cron y `EjecutarReporte.ejecutar({ tenantId, organizacionId, automatizacionIdQlik, usuarioId? })` sin tipo seleccionable.

- [ ] **Step 1: Hacer rojos los contratos**

```ts
expect(esquemaCrearDesdePlantilla.safeParse({
  nombre: "Ventas",
  flujoId: "flow-1",
  reemplazosWorkspace: [],
  programacion: { activa: true, expresionCron: "0 8 * * *", zonaHoraria: "UTC" },
}).success).toBe(false);
```
Y en `dataflow.test.ts`, exigir que `tipoEjecucion` solo acepte `manual` y que `ConfiguracionReporteDataflow` no tenga `programacion`.

- [ ] **Step 2: Ejecutar rojo**

```bash
bun test packages/contratos/src/reportes/dataflow.test.ts packages/contratos/src/automatizaciones/panel-dataflow.test.ts
cd apps/web && bunx vitest run src/modulos/reportes/pagina-nueva-automatizacion.test.tsx src/modulos/reportes/pagina-detalle-dataflow.test.tsx
```

- [ ] **Step 3: Simplificar contratos y caso de uso**

Eliminar `esquemaProgramacionReporte`, `esquemaProgramacionConfiguracionReporte`, `programacion` y el enum `programada`. Cambiar el puerto:
```ts
export interface CrearEjecucionReportePersistida {
  // ...campos existentes
  tipoEjecucion: "manual";
}
```
Cambiar `EntradaEjecutarReporte` a `{ tenantId: string; organizacionId: string; automatizacionIdQlik: string; usuarioId?: string }`. En `EjecutarReporte` persistir `tipoEjecucion: "manual"` sin aceptar `entrada.tipo`.

- [ ] **Step 4: Eliminar scheduler y cron-parser**

Borrar archivos listados, retirar imports/arranque/parada en Bun/Node y ejecutar:
```bash
cd apps/api && bun remove cron-parser
```
Eliminar `refrescarToken` de `PuertoOAuthQlik`/`ClienteOAuthQlik` y su test asociado: el único consumidor actual es `resolver-contexto-programado-postgres.ts`, que se elimina en esta tarea. Después comprobar con `rg 'refrescarToken\(' apps/api/src` que no quedan referencias.

- [ ] **Step 5: Simplificar UI y repositorio**

Crear reporte envía solo:
```ts
{ nombre, flujoId, espacioIdQlik, reemplazosWorkspace: [] }
```
El detalle edita solo `{ nombre, flujoIdQlik, activa }`. Quitar métodos `obtenerProgramacion`, `listarProgramacionesVencidas`, `intentarReclamarProgramacion` y toda transacción/upsert cron del repositorio.
- [ ] **Step 6: Verificar y commit**

```bash
bun test packages/contratos/src/reportes/dataflow.test.ts packages/contratos/src/automatizaciones/panel-dataflow.test.ts
bun test apps/api/src/modulos/reportes apps/api/src/entradas
cd apps/web && bunx vitest run src/modulos/reportes/pagina-nueva-automatizacion.test.tsx src/modulos/reportes/pagina-detalle-dataflow.test.tsx
cd ../../ && bun --cwd apps/api run typecheck && bun --cwd apps/web run typecheck
git add -A
git commit -m "refactor: eliminar programacion de reportes"
```

---

### Task 3: Eliminar Spark, SFTP, JDBC, PostgreSQL externo y API remota del runtime

**Files:**
- Delete: `apps/api/src/modulos/flujos/aplicacion/generador-catalogo-spark.ts`
- Delete: `apps/api/src/modulos/flujos/aplicacion/generador-catalogo-spark.spec.ts`
- Delete: `apps/api/src/modulos/origenes/`
- Delete: `apps/api/src/modulos/destinos/infraestructura/cliente-postgres.ts`
- Delete: `apps/api/src/modulos/destinos/infraestructura/cliente-sftp.ts`
- Modify: `apps/api/src/modulos/destinos/aplicacion/fabrica-destinos.ts`
- Modify: `apps/api/src/modulos/destinos/dominio/tipos-destino.ts`
- Modify: `packages/contratos/src/destinos/index.ts`
- Create: `packages/contratos/src/destinos/index.test.ts`
- Modify: `packages/contratos/src/admin/index.ts`
- Create: `packages/contratos/src/admin/tenant-qlik.test.ts`
- Modify: `apps/api/src/plataforma/configuracion/entorno.ts`
- Modify: `apps/api/src/plataforma/configuracion/entorno.test.ts`
- Modify: `.env.example`
- Modify: `apps/api/src/modulos/flujos/http/rutas.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modulos/admin/aplicacion/puertos/repositorio-administracion.ts`
- Modify: `apps/api/src/modulos/admin/infraestructura/helpers-admin.ts`
- Modify: `apps/api/src/modulos/admin/infraestructura/consulta-tenant-qlik-postgres.ts`
- Modify: `apps/api/src/modulos/admin/infraestructura/repositorio-administracion-postgres.ts`
- Modify: `apps/api/src/modulos/admin/http/rutas-configuracion-tenant.ts`
- Modify: `apps/web/src/modulos/admin/api.ts`
- Modify: `apps/web/src/modulos/reportes/api.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/puertos/puerto-consulta-tenant-qlik.ts`
- Modify: `apps/api/src/modulos/automatizaciones/infraestructura/consulta-tenant-qlik-postgres.ts`
- Modify: `apps/web/src/modulos/flujos/api.ts`
- Modify: `apps/web/src/modulos/flujos/pagina-detalle-flujo.tsx`
- Modify: `apps/api/package.json`
- Modify: `bun.lock`

**Interfaces:**
- Produces: `crearClienteDestino()` solo acepta BigQuery; `/api/flujos/:id/catalogo-spark` deja de existir; administración de tenant no expone API remota propia.

- [ ] **Step 1: Crear tests/guards rojos del runtime activo**

Añadir `apps/api/src/arquitectura-integraciones-activas.test.ts`:
```ts
expect(existe("src/modulos/origenes")).toBe(false);
expect(packageJson.dependencies).not.toHaveProperty("ssh2-sftp-client");
expect(codigoActivo).not.toMatch(/\b(Impala|SFTP|JDBC|Spark)\b/);
expect(codigoActivo).not.toMatch(/REMOTE_API_(URL|KEY)/);
```
El scan debe limitarse a `apps/api/src`, `apps/web/src` y `packages/contratos/src`, excluyendo migraciones, documentación histórica y el propio archivo del guard para que sus regex no se autodenuncien.

Añadir además pruebas de contrato:
```ts
expect(esquemaTipoDestino.options).toEqual(["bigquery"]);
expect(esquemaTenantQlik.parse(tenantValido)).not.toHaveProperty("destinoApiUrl");
expect(esquemaTenantQlik.parse(tenantValido)).not.toHaveProperty("destinoBaseDatos");
```
Y en `entorno.test.ts`, comprobar que `REMOTE_API_URL` y `REMOTE_API_KEY` se ignoran y no forman parte del resultado tipado.

- [ ] **Step 2: Ejecutar rojo**

```bash
bun test apps/api/src/arquitectura-integraciones-activas.test.ts packages/contratos/src/destinos/index.test.ts packages/contratos/src/admin/tenant-qlik.test.ts apps/api/src/plataforma/configuracion/entorno.test.ts
```
Expected: encuentra módulos/dependencias/campos legacy actuales.

- [ ] **Step 3: Eliminar generador Spark y conexiones de origen**
Eliminar `catalogo-spark` de rutas y API web; simplificar `PaginaDetalleFlujo` a script/metadata/automatizaciones. Eliminar `/api/conexiones-origen` del composition root.

- [ ] **Step 4: Reducir destinos a BigQuery**

`TIPOS_DESTINO` y `esquemaTipoDestino` quedan:
```ts
export const TIPOS_DESTINO = ["bigquery"] as const;
export const esquemaTipoDestino = z.enum(["bigquery"]);
```
La fábrica conserva solo el caso BigQuery y `TipoRecursoDestino`/`esquemaRecursoDestino.tipo` se reducen a `tabla|dataset`. En `modulos/reportes/api.ts`, eliminar helpers genéricos sin consumidores (`obtenerConexionesDestino`, `probarConexionDestino`, `obtenerDdlDestino`, `estimarConsultaDestino`, `obtenerCapacidadesDestino`, `crearConexionDestino`) y conservar solo las llamadas BigQuery usadas por la pantalla Resultados. Ejecutar:
```bash
cd apps/api && bun remove ssh2-sftp-client @types/ssh2-sftp-client
```

- [ ] **Step 5: Eliminar API remota propia del tenant**

Retirar campos/métodos `destinoApi*` y `destinoBaseDatos` de admin/automatizaciones. Eliminar también `esquemaConfigurarDestinoTenant`, `esquemaConfigurarConexionDestino`, los endpoints `/destino` y `/destino-generico`, y `configurarConexionDestinoTenant()` del frontend. Borrar `REMOTE_API_URL`/`REMOTE_API_KEY` del entorno y `.env.example`. No tocar configuración Qlik ni BigQuery.

- [ ] **Step 6: Verificar y commit**

```bash
bun test apps/api/src/arquitectura-integraciones-activas.test.ts packages/contratos/src/destinos/index.test.ts packages/contratos/src/admin/tenant-qlik.test.ts apps/api/src/plataforma/configuracion/entorno.test.ts
bun test apps/api/src/modulos/flujos apps/api/src/modulos/admin apps/api/src/modulos/destinos
cd apps/web && bunx vitest run src/modulos/flujos
cd ../../ && bun --cwd apps/api run typecheck && bun --cwd apps/web run typecheck
git add -A
git commit -m "refactor: dejar solo qlik y google cloud"
```

---

### Task 4: Limpiar esquema legacy hacia adelante

**Files:**
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Modify: `apps/api/src/esquema.test.ts`
- Create: `apps/api/drizzle/0015_qlik_google_cloud_only.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create/Modify: snapshot Drizzle correspondiente a `0015`

**Interfaces:**
- Consumes: runtime y contratos ya reducidos a Qlik + Google Cloud por Task 3.
- Produces: esquema actual sin programación, conexiones de origen ni columnas de API remota; `conexiones_destino` acepta únicamente `bigquery`.

- [ ] **Step 1: Escribir pruebas de esquema rojas**

En `esquema.test.ts` comprobar que no se exportan `programacionesAutomatizacion`, `conexionesOrigen` ni `destinosCache`; `configuracionesAutomatizacion` no tiene `programar`; `ejecucionesReportes.tipoEjecucion` solo permite manual según la migración/constraint.
- [ ] **Step 2: Ejecutar rojo**

```bash
bun test apps/api/src/esquema.test.ts
```

- [ ] **Step 3: Actualizar esquema Drizzle**

Eliminar del esquema activo:
```text
programaciones_automatizacion
conexiones_origen
destinos_cache
configuraciones_automatizacion.programar
tenants_qlik.destino_api_url
tenants_qlik.destino_api_key_cifrada
tenants_qlik.destino_base_datos
```
El tipo ya está restringido a `bigquery` en contratos/dominio por Task 3; aquí se alinea la base física.

- [ ] **Step 4: Crear migración 0015 y curarla**

El SQL efectivo debe contener, en este orden lógico:
```sql
DROP TABLE IF EXISTS "programaciones_automatizacion";
DROP TABLE IF EXISTS "conexiones_origen";
DROP TABLE IF EXISTS "destinos_cache";
ALTER TABLE "configuraciones_automatizacion" DROP COLUMN IF EXISTS "programar";
ALTER TABLE "tenants_qlik" DROP COLUMN IF EXISTS "destino_api_url", DROP COLUMN IF EXISTS "destino_api_key_cifrada", DROP COLUMN IF EXISTS "destino_base_datos";
UPDATE "ejecuciones_reportes" SET "tipo_ejecucion" = 'manual' WHERE "tipo_ejecucion" <> 'manual';
```
Y después:
```sql
ALTER TABLE "ejecuciones_reportes" DROP CONSTRAINT IF EXISTS "ejecuciones_reportes_tipo_check";
ALTER TABLE "ejecuciones_reportes" ADD CONSTRAINT "ejecuciones_reportes_tipo_check" CHECK ("tipo_ejecucion" = 'manual');
DELETE FROM "conexiones_destino" WHERE "tipo" <> 'bigquery';
ALTER TABLE "conexiones_destino" DROP CONSTRAINT IF EXISTS "conexiones_destino_tipo_check";
ALTER TABLE "conexiones_destino" ADD CONSTRAINT "conexiones_destino_tipo_check" CHECK ("tipo" = 'bigquery');
```
Generar snapshot/journal con Drizzle, pero revisar el SQL generado y conservar en `0015` solo cambios de esta limpieza.

- [ ] **Step 5: Verificar migración y commit**

```bash
bun test apps/api/src/esquema.test.ts
bun --cwd apps/api run typecheck
git diff --check
git add apps/api/drizzle apps/api/src/plataforma/persistencia/esquema.ts apps/api/src/esquema.test.ts
git commit -m "refactor: limpiar esquema legacy de integraciones"
```

---

### Task 5: Crear adaptador seguro de Google Cloud Storage

**Files:**
- Create: `apps/api/src/modulos/descargas/aplicacion/puerto-almacenamiento-descargas.ts`
- Create: `apps/api/src/modulos/descargas/infraestructura/cliente-gcs.ts`
- Create: `apps/api/src/modulos/descargas/infraestructura/cliente-gcs.test.ts`
- Modify: `apps/api/package.json`
- Modify: `bun.lock`
- Modify: `apps/api/src/plataforma/configuracion/entorno.ts`
- Modify: `.env.example`
- Create: `apps/api/src/modulos/reportes/dominio/destino-gcs.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.ts`

**Interfaces:**
- Produces: `URI_BASE_GCS_REPORTES`, `parsearUriGcsPermitida(uri)` y `PuertoAlmacenamientoDescargas`.
- `PuertoAlmacenamientoDescargas.listar(prefijo): Promise<ArchivoGcs[]>`.
- `PuertoAlmacenamientoDescargas.firmar(objeto, minutos): Promise<string>`.

- [ ] **Step 1: Escribir tests rojos de URI y seguridad**

```ts
expect(parsearUriGcsPermitida(
  "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
)).toEqual({ bucket: "bkt_dwh", prefijo: "POCs/TalendDescargados/ventas/e-1/" });
expect(() => parsearUriGcsPermitida("gs://otro-bucket/x/")).toThrow();
expect(() => parsearUriGcsPermitida("gs://bkt_dwh/otra-ruta/")).toThrow();
```

Para `ClienteGcs`, usar un fake de Storage e imponer que `listar()` solo llame `bucket("bkt_dwh").getFiles({ prefix })`, filtre nombres terminados en `/` y convierta `metadata.size` a número.

- [ ] **Step 2: Ejecutar rojo**

```bash
bun test apps/api/src/modulos/descargas/infraestructura/cliente-gcs.test.ts
```

- [ ] **Step 3: Añadir Storage y centralizar URI base**

```bash
cd apps/api && bun add @google-cloud/storage
```
`destino-gcs.ts` define exactamente:
```ts
export const URI_BASE_GCS_REPORTES = "gs://bkt_dwh/POCs/TalendDescargados/";
```
Actualizar creación y ejecución para importar esa constante, eliminando duplicados.
- [ ] **Step 4: Implementar `ClienteGcs`**

Construir `Storage` con la misma cuenta de servicio Google configurada para BigQuery:
```ts
new Storage({ projectId, credentials });
```
Firmar archivos con:
```ts
file.getSignedUrl({
  version: "v4",
  action: "read",
  expires: Date.now() + minutos * 60_000,
});
```
Añadir `GOOGLE_SIGNED_URL_MINUTOS` al entorno con default `15`, rango `1..60`.

- [ ] **Step 5: Verificar y commit**

```bash
bun test apps/api/src/modulos/descargas/infraestructura/cliente-gcs.test.ts
bun test apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.test.ts
bun --cwd apps/api run typecheck
git add apps/api/src/modulos/descargas apps/api/src/modulos/reportes/dominio/destino-gcs.ts apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.ts apps/api/package.json bun.lock apps/api/src/plataforma/configuracion .env.example
git commit -m "feat: preparar almacenamiento gcs para descargas"
```

---

### Task 6: Crear contratos y servicio de manifiestos de descarga

**Files:**
- Create: `packages/contratos/src/descargas/index.ts`
- Modify: `packages/contratos/src/index.ts`
- Modify: `packages/contratos/package.json`
- Create: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.ts`
- Create: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
**Interfaces:**
- Produces: `ResumenDescargaEjecucion`, `ManifiestoDescarga`, `ServicioDescargas`.
- Repositorio añade `listarEjecucionesDescargas({ tenantQlikId, organizacionId, limite })` y `obtenerEjecucionDescarga({ id, tenantQlikId, organizacionId })`.

- [ ] **Step 1: Escribir contratos y tests rojos**

En `packages/contratos/package.json` añadir `"./descargas": "./src/descargas/index.ts"`.

Contrato esperado:
```ts
export const esquemaArchivoDescarga = z.object({
  nombre: z.string().min(1),
  tamano: z.number().nonnegative(),
  url: z.string().url(),
});
export const esquemaManifiestoDescarga = z.object({
  descargaId: z.string().uuid(),
  archivos: z.array(esquemaArchivoDescarga).min(1),
});
```
`ResumenDescargaEjecucion` incluye `id`, `reporteNombre`, `automatizacionIdQlik`, `estado`, `mensajeError`, `creadoEn` y `finalizadoEn`. El número de archivos se conoce al crear el manifiesto, no al listar ejecuciones.

- [ ] **Step 2: Probar autorización y estados**

En `servicio-descargas.test.ts` cubrir:
```ts
await expect(servicio.crearManifiesto("e-ajena", contexto)).rejects.toMatchObject({ codigo: "EJECUCION_NO_ENCONTRADA" });
await expect(servicio.crearManifiesto("e-activa", contexto)).rejects.toMatchObject({ codigo: "EJECUCION_NO_COMPLETADA" });
await expect(servicio.crearManifiesto("e-vacia", contexto)).rejects.toMatchObject({ codigo: "ARCHIVOS_NO_DISPONIBLES" });
```

- [ ] **Step 3: Implementar consultas PostgreSQL con join autorizado**

`listarEjecucionesDescargas` debe hacer join `ejecuciones_reportes` → `configuraciones_automatizacion` y filtrar simultáneamente por `tenantQlikId` y `organizacionId`, orden descendente por `creadoEn`, máximo 100.
`obtenerEjecucionDescarga` devuelve además `uriBaseGcs` y `estado`; nunca acepta tenant/organización desde el navegador.

- [ ] **Step 4: Implementar manifiesto**

Secuencia exacta:
```ts
const ejecucion = await repo.obtenerEjecucionDescarga({ id, ...contexto });
if (!ejecucion) throw new ErrorAplicacion("EJECUCION_NO_ENCONTRADA", "Ejecución no encontrada", 404);
if (ejecucion.estado !== "completada") throw new ErrorAplicacion("EJECUCION_NO_COMPLETADA", "La ejecución aún no tiene archivos descargables", 409);
const { prefijo } = parsearUriGcsPermitida(ejecucion.uriBaseGcs);
if (!prefijo.endsWith(`/${ejecucion.id}/`)) throw new ErrorAplicacion("PREFIJO_GCS_INVALIDO", "La ruta de resultados no es válida", 422);
const objetos = await almacenamiento.listar(prefijo);
if (!objetos.length) throw new ErrorAplicacion("ARCHIVOS_NO_DISPONIBLES", "GCS no contiene resultados para esta ejecución", 410);
```
Firmar cada objeto por `GOOGLE_SIGNED_URL_MINUTOS` y devolver UUID + archivos ordenados por nombre.

- [ ] **Step 5: Verificar y commit**

```bash
bun test packages/contratos/src/descargas apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts
bun --cwd apps/api run typecheck
git add packages/contratos apps/api/src/modulos/descargas apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres*
git commit -m "feat: crear manifiestos seguros de descarga"
```

---

### Task 7: Exponer API `/api/descargas` y sincronizar estados Qlik

**Files:**
- Create: `apps/api/src/modulos/descargas/http/rutas-descargas.ts`
- Create: `apps/api/src/modulos/descargas/http/rutas-descargas.test.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.ts`
- Create: `apps/api/src/modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.test.ts`

**Interfaces:**
- `GET /api/descargas` → `ResumenDescargaEjecucion[]`.
- `POST /api/descargas/:id/manifiesto` → `ManifiestoDescarga`.
- `ResolverConfiguracionGoogleCloudPostgres.resolver(organizacionId, tenantQlikId)` → `{ projectId, dataset, credencialesJson }`.

- [ ] **Step 1: Escribir pruebas HTTP rojas**

```ts
const lista = await app.request("/api/descargas", { headers: sesion });
expect(lista.status).toBe(200);
expect(await lista.json()).toMatchObject({ exito: true, datos: [{ id: "e-1", estado: "completada" }] });

const manifiesto = await app.request("/api/descargas/e-1/manifiesto", { method: "POST", headers: sesion });
expect(manifiesto.status).toBe(200);
```
Añadir casos 404 ajeno, 409 en curso y 410 sin objetos.

- [ ] **Step 2: Crear resolver Google Cloud compartido**

Consultar `conexiones_destino` con:
```ts
and(
  eq(tabla.organizacionId, organizacionId),
  eq(tabla.tenantQlikId, tenantQlikId),
  eq(tabla.tipo, "bigquery"),
  eq(tabla.esPredeterminada, true),
)
```
Descifrar `secretoRefs.credencialesJson`; validar `projectId`, `dataset` y credenciales. Refactorizar `resolverBigQueryReporte` para consumir este resolver y evitar dos formas distintas de resolver Google Cloud.

- [ ] **Step 3: Implementar listado con sincronización Qlik**

En `GET /` listar primero. Para las filas `preparando|iniciada`, tomar automatizaciones distintas y ejecutar `SincronizarEjecucionesReporte.ejecutar(sesion.tenantId, automatizacionIdQlik)`; después volver a listar una sola vez.
- [ ] **Step 4: Montar rutas en `app.ts`**

Construir `ClienteGcs` desde `ResolverConfiguracionGoogleCloudPostgres` y montar:
```ts
aplicacion.route(
  "/api/descargas",
  crearRutasDescargas({
    resolverSesion,
    resolverQlik,
    repositorioReportes,
    resolverAlmacenamiento: async (c) => {
      const sesion = await resolverSesion(c);
      const google = await resolverGoogle.resolver(sesion.organizacionId, sesion.tenantId);
      return new ClienteGcs({
        projectId: google.projectId,
        credencialesJson: google.credencialesJson,
      });
    },
    minutosFirma: configuracion?.GOOGLE_SIGNED_URL_MINUTOS ?? 15,
  }),
);
```

- [ ] **Step 5: Verificar y commit**

```bash
bun test apps/api/src/modulos/descargas/http/rutas-descargas.test.ts apps/api/src/modulos/google-cloud/infraestructura/resolver-configuracion-google-cloud-postgres.test.ts
bun test apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts
bun --cwd apps/api run typecheck
git add apps/api/src/app.ts apps/api/src/modulos/descargas apps/api/src/modulos/google-cloud apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte*
git commit -m "feat: exponer descargas desde gcs"
```

---

### Task 8: Añadir página `/descargas` y descarga múltiple

**Files:**
- Create: `apps/web/src/modulos/descargas/api.ts`
- Create: `apps/web/src/modulos/descargas/rutas.tsx`
- Create: `apps/web/src/modulos/descargas/publico.ts`
- Create: `apps/web/src/modulos/descargas/pagina-descargas.tsx`
- Create: `apps/web/src/modulos/descargas/pagina-descargas.test.tsx`
- Create: `apps/web/src/modulos/descargas/componentes/tarjeta-ejecucion-descarga.tsx`
- Create: `apps/web/src/modulos/descargas/componentes/descarga-ejecucion.tsx`
- Create: `apps/web/src/modulos/descargas/presentacion-ejecucion.ts`
- Create: `apps/web/src/modulos/descargas/descargador-navegador.ts`
- Create: `apps/web/src/modulos/descargas/descargador-navegador.test.ts`
- Create: `apps/web/src/modulos/descargas/descargador-secuencial.ts`
- Create: `apps/web/src/modulos/descargas/descargador-secuencial.test.ts`
- Create: `apps/web/src/modulos/descargas/use-descarga-ejecucion.ts`
- Create: `apps/web/src/modulos/descargas/use-descarga-ejecucion.test.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/navegacion.ts`
- Modify: `apps/web/src/app/navegacion.test.ts`

**Interfaces:**
- `listarDescargas()` consume `GET /descargas`.
- `solicitarManifiesto(id)` consume `POST /descargas/:id/manifiesto`.
- `useDescargaEjecucion(id)` usa File System Access API si existe; fallback a descargas normales del navegador.

- [ ] **Step 1: Escribir tests rojos de página y navegación**

```ts
expect(NAVEGACION.some((item) => item.to === "/descargas")).toBe(true);
expect(vista.textContent).toContain("Descargas");
expect(vista.textContent).toContain("Ventas Comercial");
expect(vista.textContent).toContain("Descargar archivos");
```
La página debe reconsultar cada 2 segundos solo mientras exista una ejecución `preparando|iniciada`.

- [ ] **Step 2: Portar lógica de descarga probada**

Adaptar de `bq_reportes_creator` `descargador-navegador`, `descargador-secuencial` y `use-descarga-ejecucion`, cambiando únicamente imports/tipos/API. Mantener:
- descarga secuencial con progreso cuando `showDirectoryPicker` existe;
- fallback con anchors y pausa de 250 ms;
- enlaces individuales si Brave bloquea múltiples descargas;
- cancelación `AbortError` sin notificación de error.
- [ ] **Step 3: Implementar página `/descargas`**

Usar `PageLayout`, `PageHeader`, `EstadoCarga`, `EstadoError`, `Button` e `Icon`. No crear una nueva tabla de archivos; cada tarjeta obtiene manifiesto solo al pulsar descargar.

Estados visibles:
```text
preparando/iniciada → Generando archivos…
completada → botón Descargar
error → mostrar mensaje de ejecución, sin botón
 detenida → ejecución detenida
```

- [ ] **Step 4: Montar ruta y navegación**

En `router.tsx` añadir `...crearRutasDescargas(rutaRaiz)`. En navegación:
```ts
{ to: "/descargas", etiqueta: "Descargas", icono: "cloud" }
```

- [ ] **Step 5: Verificar y commit**

```bash
cd apps/web
bunx vitest run src/modulos/descargas src/app/navegacion.test.ts
bun run typecheck
cd ../..
git add apps/web/src/modulos/descargas apps/web/src/app
git commit -m "feat: añadir historial y descargas de reportes"
```

---

### Task 9: Documentación vigente, guard de arquitectura y regresión final

**Files:**
- Modify: `README.md`
- Modify: `docs/arquitectura/README.md`
- Modify: `docs/arquitectura/ARQUITECTURA.md`
- Modify: `docs/desarrollo/puesta-en-marcha.md`
- Modify: `docs/setup/README.md`
- Modify: `docs/setup/CONFIGURACION-PRODUCCION.md`
- Move: `docs/pdr/` → `docs/historico/pdr/`
- Create: `docs/historico/README.md`
- Modify: `docs/superpowers/specs/2026-08-14-dataflow-bigquery-reportes-design.md` para marcarla como supersedida por la spec 2026-08-17, sin reescribir su contenido histórico.
- Test: `apps/api/src/arquitectura-integraciones-activas.test.ts`
**Interfaces:**
- Produces: documentación operativa alineada con Qlik + Google Cloud y un test que impide reintroducir integraciones legacy en código activo.

- [ ] **Step 1: Actualizar documentación vigente**

La arquitectura documentada debe ser:
```text
Usuario → qlik_reportes_creator → Qlik Dataflow (lectura)
                              → Qlik Automate → Talend → BigQuery → GCS
                              → BigQuery (preflight/resultados)
                              → GCS (descargas firmadas)
PostgreSQL = persistencia interna
```
Eliminar referencias operativas a Impala, Spark, SFTP, JDBC, API remota y cron propio. `docs/historico/README.md` debe indicar que su contenido no describe el producto actual.

- [ ] **Step 2: Endurecer el guard de arquitectura**

El test debe leer recursivamente `apps/api/src`, `apps/web/src` y `packages/contratos/src` y fallar ante estas palabras completas, ignorando solo `sparkles` como nombre de icono:
```ts
for (const termino of [/\bImpala\b/i, /\bSFTP\b/i, /\bJDBC\b/i, /\bSpark\b/]) {
  expect(codigoActivo).not.toMatch(termino);
}
expect(codigoActivo).not.toMatch(/REMOTE_API_(URL|KEY)/);
for (const identificador of [
  "destinoApiUrl",
  "destinoApiKey",
  "destinoBaseDatos",
  "conexionesOrigen",
  "destinosCache",
]) {
  expect(codigoActivo).not.toContain(identificador);
}
```
También comprobar que `apps/api/package.json` no contenga `cron-parser` ni `ssh2-sftp-client`.

- [ ] **Step 3: Ejecutar matriz completa**

```bash
bun test apps/api/src
bun test packages/contratos/src
cd apps/web && bun run test:run && cd ../..
bun --cwd packages/contratos run typecheck
bun --cwd apps/api run typecheck
bun --cwd apps/web run typecheck
bun --cwd packages/contratos run build
bun --cwd apps/api run build
bun --cwd apps/web run build
bunx biome check apps/api/src apps/web/src packages/contratos/src
git diff --check
```
- [ ] **Step 4: Smoke test local autenticado**

Con API y Vite activos, verificar en navegador con la sesión Qlik existente:
```text
http://localhost:5173/flujos        → lista Dataflows reales
/reportes/nuevo                     → mismo conjunto de Dataflows
/descargas                          → historial de ejecuciones
```
A nivel API, una llamada sin cookie a `/api/flujos` debe devolver 401/403, nunca 404; esto confirma que la ruta está montada incluso sin sesión.

Para una ejecución completada real, solicitar el manifiesto y comprobar que todos los `url` son HTTPS firmados y que todos los objetos pertenecen a `bkt_dwh/POCs/TalendDescargados/<reporte>/<ejecucion>/`.

- [ ] **Step 5: Verificación de limpieza textual vigente**

```bash
rg -n '\b(Impala|SFTP|JDBC|Spark)\b|REMOTE_API_(URL|KEY)|destinoApiUrl|destinoApiKey|destinoBaseDatos|conexionesOrigen|destinosCache' \
  apps/api/src apps/web/src packages/contratos/src README.md \
  docs/arquitectura docs/desarrollo docs/setup \
  --glob '!apps/api/src/arquitectura-integraciones-activas.test.ts'
```
Expected: sin resultados; el propio test de guard debe excluirse explícitamente del scan. No ejecutar este criterio sobre `apps/api/drizzle`, `docs/historico` ni `docs/superpowers` porque son historial preservado.

- [ ] **Step 6: Commit final**

```bash
git add README.md docs apps/api/src/arquitectura-integraciones-activas.test.ts
git commit -m "docs: alinear plataforma con qlik y google cloud"
git status --short
```
Expected: worktree limpio.

## Final Acceptance

- `/flujos` y el selector de reportes usan la misma fuente y muestran Dataflows Qlik reales.
- No existe programación propia ni ejecución `programada`.
- No existen módulos activos de Impala, Spark, SFTP, JDBC ni API remota propia.
- `conexiones_destino` solo admite BigQuery; PostgreSQL sigue siendo únicamente persistencia interna.
- `/descargas` lista ejecuciones y genera manifests firmados desde GCS usando `uriBaseGcs` auditado.
- Descarga múltiple funciona con File System Access API y fallback de navegador.
- Qlik Automate sigue ejecutando Talend con SQL regenerado en cada ejecución manual.
- Tests, typechecks, builds, Biome y `git diff --check` pasan.
