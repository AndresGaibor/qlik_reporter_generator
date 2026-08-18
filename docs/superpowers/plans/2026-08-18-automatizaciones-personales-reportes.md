# Automatizaciones personales reutilizables para reportes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desacoplar reportes de Qlik Automate y crear un único worker personal reutilizable por `usuario + tenant Qlik`, manteniendo Dataflow → cuatro queries Talend → GCS.

**Architecture:** `reportes` pasa a ser la fuente de verdad local para catálogo/configuración. Un servicio `ObtenerOCrearAutomatizacionPersonal` resuelve el worker del usuario y `EjecutarReporte` serializa únicamente `actualizar workspace → crear run`; las ejecuciones conservan el Automate Qlik exacto usado como snapshot histórico.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM/PostgreSQL, React 18, TanStack Query/Router, Zod, Vitest/Bun test, Biome.

**Spec:** `docs/superpowers/specs/2026-08-18-automatizaciones-personales-reportes-design.md`

## Global Constraints

- Modificar únicamente `qlik_reportes_creator`.
- Qlik Dataflow es diseñador visual y nunca se ejecuta como motor del reporte.
- Cada ejecución relee `scripts/current` y recompila; no reutiliza SQL anterior.
- Qlik Automate y Talend permanecen obligatorios en runtime.
- Conservar `BqSelectData`, `BqNumberCsv`, `BqExportData`, `BqDrop` y `Credenciales`.
- Conservar CSV GZIP, delimitador `|`, máximo 1.000.000 filas por bloque y marcador `__finalizado__-*`.
- No reintroducir cron, schedules de reportes, SFTP ni edición de workspace desde UI.
- No ejecutar BigQuery real salvo instrucción explícita del usuario.
- Cada tarea usa TDD y termina con un commit pequeño.

---
### Task 1: Contratos de reporte local y auditoría de usuario

**Files:**
- Modify: `packages/contratos/src/reportes/dataflow.ts`
- Test: `packages/contratos/src/reportes/dataflow.test.ts`

**Interfaces:**
- Produces: `CrearReporte`, `ResumenReporte`, `DetalleReporte`, `ConfiguracionReporteDataflow` sin Automate propio.
- Produces: `DetalleEjecucionReporte.ejecutadoPorUsuarioId` y `automatizacionPersonalId` nullable.

- [ ] **Step 1: Escribir pruebas de contrato que rechacen propiedad de Automate en reportes**

```ts
expect(() => esquemaConfiguracionReporteDataflow.parse({
  id: crypto.randomUUID(), nombre: "Ventas", flujoIdQlik: "df-1",
  flujoNombreSnapshot: "Ventas DF", flujoEspacioIdQlik: null,
  automatizacionIdQlik: "legacy-auto", destinoGcs: "gs://bucket/",
  activa: true,
})).toThrow();
```

- [ ] **Step 2: Ejecutar el test y comprobar RED**

Run: `bun test packages/contratos/src/reportes/dataflow.test.ts`
Expected: FAIL porque el contrato actual exige `automatizacionIdQlik` y `automatizacionNombreSnapshot`.
- [ ] **Step 3: Implementar contratos locales explícitos**

```ts
export const esquemaCrearReporte = z.object({
  nombre: z.string().trim().min(1).max(255),
  flujoIdQlik: z.string().trim().min(1),
  espacioIdQlik: z.string().trim().min(1).optional(),
}).strict();

export const esquemaConfiguracionReporteDataflow = z.object({
  id: z.string().uuid(), nombre: z.string(), flujoIdQlik: z.string(),
  flujoNombreSnapshot: z.string(), flujoEspacioIdQlik: z.string().nullable(),
  destinoGcs: z.string().startsWith("gs://"), activa: z.boolean(),
  creadoPorUsuarioId: z.string().uuid(),
}).strict();
```

Sustituir `configuracionId` por `reporteId` en `esquemaDetalleEjecucionReporte`; añadir `ejecutadoPorUsuarioId: z.string().uuid()` y `automatizacionPersonalId: z.string().uuid().nullable()`; conservar `automatizacionIdQlik` como snapshot histórico.

- [ ] **Step 4: Ejecutar contratos y typecheck**

Run: `bun test packages/contratos/src/reportes/dataflow.test.ts && bun run --cwd packages/contratos typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contratos/src/reportes/dataflow.ts packages/contratos/src/reportes/dataflow.test.ts
git commit -m "refactor: separar contratos de reportes y automate"
```
### Task 2: Esquema PostgreSQL y repositorios de reportes/workers

**Files:**
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-automatizaciones-personales.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.ts`
- Test: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- Create test: `apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts`
- Generate: siguiente migración Drizzle `0004_*` y `meta/0004_snapshot.json` mediante `db:generate`.

**Interfaces:**
- `PuertoRepositorioReportes.obtenerPorId(reporteId, tenantQlikId, organizacionId)`.
- `PuertoRepositorioReportes.listar(contexto)` devuelve reportes locales.
- `PuertoRepositorioAutomatizacionesPersonales.obtener(usuarioId, tenantQlikId)`.
- `PuertoRepositorioAutomatizacionesPersonales.crear(entrada)` y `actualizar(id, cambios)` mantienen un worker vigente.

- [ ] **Step 1: Escribir pruebas RED de persistencia sin Automate en reporte**

```ts
const reporte = await repo.crearReporte({ organizacionId, tenantQlikId,
  creadoPorUsuarioId: usuarioId, nombre: "Ventas", flujoIdQlik: "df-1",
  flujoNombreSnapshot: "Ventas DF", estado: "activa" });
expect(reporte).not.toHaveProperty("automatizacionIdQlik");
```
- [ ] **Step 2: Escribir prueba RED de unicidad del worker**

```ts
await workers.crear({ organizacionId, tenantQlikId, usuarioId,
  automatizacionIdQlik: "auto-1", automatizacionNombreSnapshot: "Reportes Andres",
  estado: "activo" });
await expect(workers.crear({ organizacionId, tenantQlikId, usuarioId,
  automatizacionIdQlik: "auto-2", automatizacionNombreSnapshot: "Duplicado",
  estado: "activo" })).rejects.toThrow();
```

Run: `bun test apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts`
Expected: FAIL porque tabla/puerto/métodos aún no existen.

- [ ] **Step 3: Cambiar esquema Drizzle preservando datos**

En `esquema.ts`, reemplazar `configuracionesAutomatizacion` por `reportes`, eliminar sus columnas Automate, añadir `automatizacionesPersonalesQlik` con unique `(usuarioId, tenantQlikId)`, y en `ejecucionesReportes` añadir `reporteId`, `ejecutadoPorUsuarioId` y `automatizacionPersonalId` nullable manteniendo `automatizacionIdQlik`.

La migración generada debe renombrar `configuraciones_automatizacion` a `reportes` y `configuracion_id` a `reporte_id`, no copiar filas a una tabla nueva. Añadir FKs nuevas sin alterar snapshots históricos.

- [ ] **Step 4: Generar y revisar la migración**

Run: `bun run --cwd apps/api db:generate`
Expected: nueva migración `0004_*` y snapshot correspondiente. Revisar que use rename/drop/add y no `DROP TABLE reportes` ni pérdida de `ejecuciones_reportes`.
- [ ] **Step 5: Implementar puertos y repositorios mínimos**

```ts
export interface PuertoRepositorioAutomatizacionesPersonales {
  obtener(usuarioId: string, tenantQlikId: string): Promise<AutomatizacionPersonalPersistida | null>;
  crear(entrada: CrearAutomatizacionPersonalPersistida): Promise<AutomatizacionPersonalPersistida>;
  actualizar(id: string, cambios: ActualizarAutomatizacionPersonalPersistida): Promise<AutomatizacionPersonalPersistida>;
  listarPorTenant(tenantQlikId: string, organizacionId: string): Promise<AutomatizacionPersonalPersistida[]>;
}
```

Actualizar `PuertoRepositorioReportes` a `crearReporte`, `obtenerPorId`, `listar`, `actualizarReporte`, `clonarReporte` y mantener los métodos de ejecuciones/descargas usando `reporteId`.

- [ ] **Step 6: Ejecutar tests, typecheck y db check local**

Run: `bun test apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-automatizaciones-personales-postgres.test.ts && bun run --cwd apps/api typecheck && bun run db:check`
Expected: PASS; no consulta BigQuery.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/plataforma/persistencia/esquema.ts apps/api/drizzle apps/api/src/modulos/reportes/aplicacion/puertos apps/api/src/modulos/reportes/infraestructura
git commit -m "refactor: separar reportes y workers qlik"
```
### Task 3: Crear/editar/clonar reportes sin tocar Qlik Automate

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/crear-reporte.ts`
- Create test: `apps/api/src/modulos/reportes/aplicacion/crear-reporte.test.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/clonar-reporte.ts`
- Create test: `apps/api/src/modulos/reportes/aplicacion/clonar-reporte.test.ts`
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify test: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`

**Interfaces:**
- `CrearReporte.ejecutar(entrada, contexto): Promise<ConfiguracionReportePersistida>`.
- `ClonarReporte.ejecutar(reporteId, nombre, contexto)` crea otra fila con el mismo Dataflow.
- Ninguno recibe `plantillaIdQlik` ni llama a `copiarAutomatizacion`.

- [ ] **Step 1: Escribir prueba RED de creación local**

```ts
const creado = await caso.ejecutar({ nombre: "Ventas", flujoIdQlik: "df-1" }, contexto);
expect(creado.nombre).toBe("Ventas");
expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
expect(repo.crearReporte).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Ejecutar prueba y comprobar RED**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/crear-reporte.test.ts`
Expected: FAIL porque el caso de uso no existe.
- [ ] **Step 3: Implementar creación local con preflight y snapshot Dataflow**

```ts
const validacion = await this.preflight.ejecutar(entrada.flujoIdQlik);
if (!validacion.compatible) throw new ErrorAplicacion("DATAFLOW_NO_COMPATIBLE", "El Dataflow contiene operaciones no soportadas", 422);
const flujo = (await this.qlik.listarFlujos(entrada.espacioIdQlik)).find(f => f.id === entrada.flujoIdQlik);
if (!flujo) throw new ErrorAplicacion("DATAFLOW_NO_ENCONTRADO", "El Dataflow seleccionado ya no existe en Qlik", 404);
return this.reportes.crearReporte({
  organizacionId: contexto.organizacionId, tenantQlikId: contexto.tenantId,
  creadoPorUsuarioId: contexto.usuarioId, nombre: entrada.nombre,
  flujoIdQlik: flujo.id, flujoNombreSnapshot: flujo.name,
  flujoEspacioIdQlik: flujo.spaceId ?? undefined, estado: "activa",
});
```

- [ ] **Step 4: Añadir edición/clonado sin side effects Qlik**

La actualización de nombre solo llama a `actualizarReporte`; cambiar Dataflow ejecuta preflight + snapshot nuevo. `ClonarReporte` lee el reporte autorizado y llama `crearReporte` con nombre nuevo y mismo Dataflow.

- [ ] **Step 5: Ejecutar casos de uso y rutas focalizadas**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/crear-reporte.test.ts apps/api/src/modulos/reportes/aplicacion/clonar-reporte.test.ts apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`
Expected: PASS y ninguna expectativa de copia/rename Automate.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modulos/reportes/aplicacion apps/api/src/modulos/reportes/http
git commit -m "feat: crear reportes sin copiar automate"
```
### Task 4: Resolver y crear el worker personal reutilizable

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.ts`
- Create test: `apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.ts`
- Modify test: `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.test.ts`
- Reuse: `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.ts`
- Reuse: `apps/api/src/modulos/automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.ts`

**Interfaces:**
- `ObtenerOCrearAutomatizacionPersonal.ejecutar(contexto): Promise<AutomatizacionPersonalPersistida>`.
- Contexto: `organizacionId`, `tenantQlikId`, `usuarioId`, `usuarioIdQlik`, `plantillaIdQlik`, `plantillaNombre`.
- `copiarAutomatizacionPersonal` copia plantilla, intenta change-owner, valida contrato y nunca inyecta metadata de reporte.

- [ ] **Step 1: Escribir pruebas RED de lazy creation y reutilización**

```ts
const uno = await caso.ejecutar(ctx);
const dos = await caso.ejecutar(ctx);
expect(uno.id).toBe(dos.id);
expect(qlik.copiarAutomatizacion).toHaveBeenCalledTimes(1);
```
- [ ] **Step 2: Escribir pruebas RED de concurrencia y recuperación 404**

```ts
await Promise.all([caso.ejecutar(ctx), caso.ejecutar(ctx)]);
expect(qlik.copiarAutomatizacion).toHaveBeenCalledTimes(1);

repo.obtener.mockResolvedValue(workerExistente);
qlik.obtenerAutomatizacion.mockRejectedValueOnce(new Error("404"));
await caso.ejecutar(ctx);
expect(qlik.copiarAutomatizacion).toHaveBeenCalledTimes(1);
```

Añadir caso donde `validarContratoTalend(workspace)` falla para un worker existente y esperar `WORKER_INCOMPATIBLE`, sin `actualizarAutomatizacion` ni reparación in-place.

- [ ] **Step 3: Implementar lock de creación y double-check**

```ts
return this.bloqueos.ejecutarExclusivo(
  `automatizacion-personal:${ctx.tenantQlikId}:${ctx.usuarioId}`,
  async () => (await this.repo.obtener(ctx.usuarioId, ctx.tenantQlikId))
    ?? this.crearDesdePlantilla(ctx),
);
```

El servicio valida primero la plantilla configurada; una copia inválida se elimina y no se persiste. Para 404 del worker persistido, crea una copia nueva y actualiza la misma fila.

- [ ] **Step 4: Ejecutar pruebas focalizadas**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal.test.ts apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.test.ts`
Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modulos/reportes/aplicacion/obtener-o-crear-automatizacion-personal* apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion*
git commit -m "feat: crear worker qlik personal por tenant"
```

### Task 5: Refactorizar ejecución por `reporteId` y lock corto

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`
- Modify test: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts`
- Modify test: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts`

**Interfaces:**
- `EntradaEjecutarReporte = { reporteId, tenantId, organizacionId, usuarioId, usuarioIdQlik }`.
- Consume: `ObtenerOCrearAutomatizacionPersonal` de Task 4.
- Produce: `{ runId, ejecucionReporteId }` conservando worker exacto en auditoría.

- [ ] **Step 1: Reescribir prueba RED para resolver reporte local y worker**

```ts
await caso.ejecutar({ reporteId: reporte.id, tenantId, organizacionId, usuarioId, usuarioIdQlik });
expect(repo.obtenerPorId).toHaveBeenCalledWith(reporte.id, tenantId, organizacionId);
expect(workers.ejecutar).toHaveBeenCalled();
```
- [ ] **Step 2: Escribir prueba RED que demuestre lock corto**

Registrar orden de llamadas y exigir:

```ts
expect(orden).toEqual([
  "leer-reporte", "preparar-dataflow", "resolver-worker", "crear-auditoria",
  "lock", "obtener-workspace", "actualizar-workspace", "crear-run", "unlock",
]);
```

No incluir `listarEjecuciones`/`estaEjecucionEnCurso` como precondición. El lock debe empezar después de compilar y de resolver el worker.

- [ ] **Step 3: Implementar la nueva secuencia**

```ts
const reporte = await this.repositorio.obtenerPorId(entrada.reporteId, entrada.tenantId, entrada.organizacionId);
const preparacion = await prepararDataflowActual(this.qlik, reporte.flujoIdQlik, this.alcanceBigQuery);
const worker = await this.workers.ejecutar(contextoWorker);
await this.repositorio.crearEjecucion({
  id: ejecucionReporteId, reporteId: reporte.id, flujoIdQlik: reporte.flujoIdQlik,
  ejecutadoPorUsuarioId: entrada.usuarioId, automatizacionPersonalId: worker.id,
  automatizacionIdQlik: worker.automatizacionIdQlik, hashDataflowSha256: preparacion.hashDataflowSha256,
  scriptDataflow: preparacion.scriptDataflow, sqlBigQueryCompilado: preparacion.sqlBigQuery,
  scriptExportacion, uriBaseGcs, estado: "preparando", versionCompilador: VERSION_COMPILADOR,
});
```

Después ejecutar `bloqueos.ejecutarExclusivo(workerKey, async () => PUT workspace + POST run)` y marcar iniciada fuera o inmediatamente después de obtener `runId`.

- [ ] **Step 4: Mantener sincronización GCS/Qlik histórica**

`SincronizarEjecucionesReporte` recibe `reporteId`; usa el `automatizacionIdQlik` guardado en cada ejecución cuando necesita consultar Qlik, nunca el worker vigente. `completada` sigue dependiendo de `__finalizado__`.
- [ ] **Step 5: Ejecutar pruebas de ejecución e integración local**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`
Expected: PASS; ninguna llamada BigQuery real.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte* apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte*
git commit -m "refactor: ejecutar reportes con worker personal"
```

### Task 6: API de reportes locales y separación del panel Qlik

**Files:**
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify test: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/http/rutas-panel.ts`
- Modify test: `apps/api/src/modulos/automatizaciones/http/rutas-panel.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/modulos/admin/api.ts`

**Interfaces:**
- `/api/reportes` lista/crea reportes PostgreSQL.
- `/api/reportes/:reporteId` consulta/edita el reporte local.
- `/api/reportes/:reporteId/ejecuciones` dispara Task 5.
- Panel técnico de Automates se monta en `/api/qlik/automatizaciones`, no bajo `/api/reportes`.
- [ ] **Step 1: Escribir pruebas RED de rutas por ID local**

```ts
const lista = await app.request("/api/reportes");
expect(await lista.json()).toMatchObject({ exito: true });
expect(repo.listar).toHaveBeenCalledWith({ tenantQlikId: tenantId, organizacionId });

await app.request(`/api/reportes/${reporteId}/ejecuciones`, { method: "POST" });
expect(ejecutarReporte).toHaveBeenCalledWith(expect.objectContaining({ reporteId }));
```

Añadir prueba que un Automate Qlik arbitrario no aparezca en `GET /api/reportes`.

- [ ] **Step 2: Mover panel Qlik técnico fuera de `/reportes`**

En `app.ts`, montar `crearRutasPanelAutomatizaciones` en `/api/qlik/automatizaciones`; mantener solo listar/detalle/workspace técnico y retirar de ese panel creación/ejecución de reportes.

Actualizar `listarAutomatizacionesParaAdmin()` a `GET /qlik/automatizaciones?incluirBase=true`.

- [ ] **Step 3: Implementar REST local de reportes**

```ts
rutas.get("/", listarReportes);
rutas.post("/", crearReporte);
rutas.get("/:reporteId", obtenerReporte);
rutas.put("/:reporteId", actualizarReporte);
rutas.post("/:reporteId/clonar", clonarReporte);
rutas.post("/:reporteId/ejecuciones", ejecutarReporte);
rutas.get("/:reporteId/ejecuciones", listarEjecuciones);
```
- [ ] **Step 4: Ejecutar rutas y composition root**

Run: `bun test apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts apps/api/src/modulos/automatizaciones/http/rutas-panel.test.ts && bun run --cwd apps/api typecheck`
Expected: PASS; `/api/reportes` ya no depende de `ConsultarPanelAutomatizaciones`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modulos/reportes/http apps/api/src/modulos/automatizaciones/http apps/api/src/app.ts apps/web/src/modulos/admin/api.ts
git commit -m "refactor: separar api de reportes y automates qlik"
```

### Task 7: Validación estricta de plantilla y diagnóstico de workers

**Files:**
- Modify: `apps/api/src/modulos/admin/http/rutas-configuracion-tenant.ts`
- Modify: `apps/api/src/modulos/admin/publico.ts`
- Modify: `apps/api/src/app.ts`
- Create test: `apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts`
- Modify: `apps/web/src/modulos/admin/api.ts`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-automatizacion-base-tenant.tsx`
- Modify: `apps/web/src/modulos/admin/componentes/seccion-configurar-automatizacion-base.tsx`
- Modify test: `apps/web/src/modulos/admin/componentes/resumen-plantilla-base.test.tsx`

**Interfaces:**
- Guardar plantilla exige `validarContratoTalend(workspace)` antes de persistir ID/nombre.
- `GET /api/admin/organizaciones/:id/tenants-qlik/:tenantQlikId/workers` lista workers.
- `POST /api/admin/organizaciones/:id/tenants-qlik/:tenantQlikId/workers/:workerId/recrear` recrea explícitamente un worker incompatible.
- [ ] **Step 1: Escribir prueba RED de plantilla incompatible**

```ts
qlik.obtenerAutomatizacion.mockResolvedValue({ id: "base", workspace: { blocks: [] } });
const res = await requestGuardarBase();
expect(res.status).toBe(422);
expect(repo.configurarAutomatizacionBase).not.toHaveBeenCalled();
```

- [ ] **Step 2: Inyectar `resolverQlik` en rutas admin y validar antes de persistir**

Obtener la automatización seleccionada, llamar `validarContratoTalend(workspace)` y traducir el fallo a `PLANTILLA_INCOMPATIBLE` con detalles solo en respuesta administrativa.

- [ ] **Step 3: Añadir listado/recreación explícita de workers**

```ts
rutas.get("/organizaciones/:id/tenants-qlik/:tenantQlikId/workers", listarWorkers);
rutas.post("/organizaciones/:id/tenants-qlik/:tenantQlikId/workers/:workerId/recrear", recrearWorker);
```

`recrear` valida la plantilla actual, crea copia nueva, actualiza asociación y no modifica/borrar automáticamente el Automate roto.

- [ ] **Step 4: Actualizar copy de administración**

Cambiar “se copiará al crear cada reporte” por “se usará para crear la automatización personal del usuario en su primer uso”. Mostrar estado de contrato y un bloque compacto de workers con `Ver en Qlik` / `Recrear desde plantilla` para errores.

- [ ] **Step 5: Ejecutar tests admin API/web**

Run: `bun test apps/api/src/modulos/admin/http/rutas-automatizaciones-personales.test.ts && bun run --cwd apps/web test:run -- seccion-configurar-automatizacion-base resumen-plantilla-base`
Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modulos/admin apps/api/src/app.ts apps/web/src/modulos/admin
git commit -m "feat: validar plantilla y administrar workers qlik"
```

### Task 8: Frontend de reportes basado en PostgreSQL

**Files:**
- Modify: `apps/web/src/modulos/reportes/api.ts`
- Modify: `apps/web/src/modulos/reportes/rutas.tsx`
- Rename/refactor: `apps/web/src/modulos/reportes/pagina-automatizaciones.tsx` → `pagina-reportes.tsx`
- Rename/refactor: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx` → `pagina-nuevo-reporte.tsx`
- Rename/refactor: `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx` → `pagina-detalle-reporte.tsx`
- Rename/refactor: `apps/web/src/modulos/reportes/componentes/lista-automatizaciones.tsx` → `lista-reportes.tsx`
- Modify tests: `apps/web/src/modulos/reportes/*.test.tsx`, `apps/web/src/modulos/reportes/api-dataflow.test.ts`

**Interfaces:**
- `obtenerReportes()` consume `GET /reportes` y devuelve `ResumenReporte[]`.
- `crearReporte()` hace `POST /reportes`; `ejecutarReporte(reporteId)` hace `POST /reportes/:id/ejecuciones`.
- Las rutas siguen visibles como `/reportes`, `/reportes/nueva`, `/reportes/$id`, pero `$id` es UUID local.

- [ ] **Step 1: Escribir pruebas RED de catálogo compartido**

```tsx
render(<PaginaReportes />);
await screen.findByText("Reporte Ventas");
expect(screen.queryByText("Automate manual Qlik")).not.toBeInTheDocument();
expect(api.obtenerReportes).toHaveBeenCalled();
```
- [ ] **Step 2: Eliminar filtros por propietario Qlik en modo usuario final**

Retirar `obtenerAutorReporte`, `propietarioId`, `propietarioNombre` y coincidencias por nombre como criterio de visibilidad. Mantener filtros de búsqueda/espacio y mostrar `creadoPor` solo como metadata si el contrato lo incluye.

- [ ] **Step 3: Cambiar creación para que solo persista reporte**

```ts
const resultado = await crearReporte({
  nombre: nombreFinal,
  flujoIdQlik: flujo.id,
  espacioIdQlik: flujo.espacioId || undefined,
});
window.location.href = `/reportes/${resultado.id}`;
```

La UI mantiene selector Dataflow, preflight y destino GCS; elimina cualquier lenguaje que diga que se está copiando una automatización.

- [ ] **Step 4: Rehacer detalle sobre reporte local**

La página carga `obtenerReporte(id)`, preflight del Dataflow y `obtenerEjecucionesReporte(id)`. El botón `Ejecutar` llama a `ejecutarReporte(id)`. No carga `obtenerDetalleAutomatizacion(id)` ni construye `/automations/${id}` como si el reporte fuera Qlik.

- [ ] **Step 5: Clonar/editar como operaciones locales**

`clonarReporte(id, { nombre })` no copia Qlik. Renombrar o cambiar Dataflow invalida únicamente queries React del reporte local.

- [ ] **Step 6: Ejecutar suite web focalizada**

Run: `bun run --cwd apps/web test:run -- pagina-reportes pagina-nuevo-reporte pagina-detalle-reporte lista-reportes api-dataflow`
Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add apps/web/src/modulos/reportes
git commit -m "refactor: mostrar reportes locales en la interfaz"
```

### Task 9: Retirar semántica legacy de Automate y cancelación engañosa

**Files:**
- Delete after migration: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.ts`
- Delete test: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/http/rutas-panel.ts`
- Modify: `packages/contratos/src/automatizaciones/panel.ts`
- Modify: `apps/web/src/modulos/reportes/componentes/tarjeta-detalle-automatizacion.tsx` or replace with report card component.
- Delete/replace: `apps/web/src/modulos/reportes/componentes/modal-clonar-automatizacion.tsx`
- Modify tests under `apps/web/src/modulos/reportes/componentes/`.

**Interfaces:**
- El panel Qlik técnico conserva listar/detalle/workspace solo lectura para administración.
- No existe endpoint público de “detener reporte” que solo detenga un Qlik run.
- No existe clonación de Qlik Automate desde el dominio `/reportes`.

- [ ] **Step 1: Escribir pruebas RED de ausencia de acciones legacy**

```tsx
render(<PaginaDetalleReporte id={reporteId} />);
expect(screen.queryByRole("button", { name: /detener ejecución/i })).not.toBeInTheDocument();
```
- [ ] **Step 2: Retirar endpoints y contratos que mezclan reporte con Automate**

Eliminar de `/api/reportes` cualquier `desde-plantilla`, `/:id/clonar` de Automate y `/:id/ejecuciones/:run/detener`. Si el panel técnico Qlik conserva clonación por necesidad administrativa, debe estar fuera del dominio reportes y no ser consumido por UI de usuario final.

- [ ] **Step 3: Eliminar componentes/imports legacy confirmados sin consumidores**

Después de migrar páginas a `Reporte`, ejecutar búsquedas:

```bash
rg -n 'crearAutomatizacionDesdePlantilla|clonarAutomatizacion|detenerEjecucion|PaginaAutomatizaciones|PaginaDetalleAutomatizacion|PaginaNuevaAutomatizacion' apps packages
```

Expected: cero referencias productivas; referencias históricas solo en docs/migraciones si aplican.

- [ ] **Step 4: Ejecutar guardas y tests de regresión**

Run: `bun test apps/api/src/modulos/automatizaciones apps/api/src/modulos/reportes packages/contratos/src/reportes && bun run --cwd apps/web test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modulos/automatizaciones apps/api/src/modulos/reportes apps/web/src/modulos/reportes packages/contratos/src
git commit -m "refactor: retirar semantica legacy de automate por reporte"
```
### Task 10: Regresión de descargas, migración y verificación integral

**Files:**
- Modify if needed: `apps/api/src/modulos/descargas/http/rutas-descargas.ts`
- Modify if needed: `apps/web/src/modulos/descargas/pagina-descargas.tsx`
- Test: `apps/web/src/modulos/descargas/pagina-descargas.test.tsx`
- Test: `apps/web/src/modulos/descargas/descargador-navegador.test.ts`
- Test: `apps/web/src/modulos/descargas/descargador-secuencial.test.ts`
- Test: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- Verify migration: `apps/api/drizzle/0004_*` generated in Task 2.

**Interfaces:**
- Descargas resuelven ejecución por `reporteId`/ejecución local, no por worker vigente.
- `ResumenEjecucionDescarga.automatizacionIdQlik` puede conservarse como dato técnico histórico, nunca como clave para buscar el reporte actual.

- [ ] **Step 1: Añadir regresión de descarga tras recrear worker**

```ts
const historica = ejecucion({ automatizacionIdQlik: "auto-viejo", uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/reportes/ventas/run-1/" });
workerActual.automatizacionIdQlik = "auto-nuevo";
expect(await repo.obtenerEjecucionDescarga({ id: historica.id, tenantQlikId, organizacionId }))
  .toMatchObject({ uriBaseGcs: historica.uriBaseGcs, automatizacionIdQlik: "auto-viejo" });
```

- [ ] **Step 2: Ejecutar migración en la BD local y comprobar preservación**

Antes de migrar, registrar conteos/IDs de reportes y ejecuciones. Ejecutar `bun run db:migrate`; después comprobar mismos IDs/conteos y una fila `reportes` por cada antigua `configuraciones_automatizacion`.
- [ ] **Step 3: Ejecutar regresión de descargas**

Run: `bun run --cwd apps/web test:run -- pagina-descargas descargador-navegador descargador-secuencial && bun test apps/api/src/modulos/descargas apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
Expected: PASS; `__finalizado__` y `parte-*.csv.gz` siguen gobernando disponibilidad.

- [ ] **Step 4: Ejecutar verificación completa desde HEAD limpio**

Run: `bun run verify`
Expected: lint, typecheck, backend/contratos, web y build PASS.

Run: `git diff --check && git status --short`
Expected: `git diff --check` sin salida; antes del commit solo cambios deliberados de esta tarea.

- [ ] **Step 5: Escanear residuos arquitectónicos**

```bash
rg -n 'configuracionesAutomatizacion|configuraciones_automatizacion|obtenerPorAutomatizacion|automatizacionNombreSnapshot' apps packages --glob '!apps/api/drizzle/**'
rg -n 'crearAutomatizacionDesdePlantilla|detenerEjecucion\(' apps/web apps/api packages
```

Expected: cero referencias productivas legacy. Las únicas referencias aceptables a nombres de tablas antiguas están dentro de migraciones históricas.

- [ ] **Step 6: Commit final de regresión/ajustes**

```bash
git add -A
git commit -m "test: verificar workers personales y descargas"
```

## Execution Notes

- No hacer `push` salvo petición explícita del usuario.
- No borrar Automates legacy de Qlik durante esta implementación.
- No disparar un reporte real ni BigQuery para demostrar funcionamiento; usar fixtures/mocks y dejar E2E externo como validación manual posterior si el usuario lo solicita.
