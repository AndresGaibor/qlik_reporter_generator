# Dataflow → BigQuery Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el Dataflow actual de Qlik en SQL BigQuery en cada ejecución de reporte, mantener Qlik Automate + Talend como orquestación/ejecución y exportar CSV GZIP a GCS en bloques lógicos de máximo 1.000.000 filas.

**Architecture:** `qlik_reportes_creator` será la fuente de verdad de ejecución: lee `/scripts/current`, calcula SHA-256, parsea a un IR estricto, compila SQL, genera el script `EXPORT DATA`, actualiza `gcp_script` en Qlik Automate bajo lock y crea el run. Los schedules también llaman este mismo caso de uso; el Dataflow nunca se ejecuta.

**Tech Stack:** Bun, TypeScript 5.5, Hono, React 18, TanStack Query/Router, Drizzle/PostgreSQL, `@google-cloud/bigquery`, Vitest/Bun test, Biome.

## Global Constraints

- Proyecto único a modificar: `~/code/javascript/qlik_reportes_creator`.
- `qlik_automate_creator` y `bq_reportes_creator` son solo referencias; no modificarlos.
- Qlik Dataflow es diseñador visual y nunca se ejecuta.
- Qlik Automate y el Job Talend permanecen en el runtime.
- Toda ejecución manual o programada pasa primero por la plataforma.
- Fuente soportada en v1: BigQuery.
- Destino único: `gs://bkt_dwh/POCs/TalendDescargados/`.
- Máximo: 1.000.000 filas por bloque lógico exportado.
- Operaciones Qlik no soportadas bloquean preflight/ejecución; nunca se ignoran.
- Cada ejecución guarda hash SHA-256, snapshot Dataflow, SQL compilado y script final enviado a Talend.
- Preservar todos los cambios locales no relacionados que ya existen en `main`.

---
## File Structure

- `packages/contratos/src/reportes/dataflow.ts`: contratos de preflight, reporte persistido y auditoría de ejecución.
- `apps/api/src/modulos/reportes/dominio/plan-dataflow.ts`: IR tipado y errores de compatibilidad.
- `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.ts`: script Qlik → IR.
- `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.ts`: IR → BigQuery Standard SQL.
- `apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv.ts`: SELECT → script `EXPORT DATA` <= 1M.
- `apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.ts`: leer current + hash + parse + compile + dry-run.
- `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`: persistencia de configuración/ejecuciones.
- `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`: Drizzle/PostgreSQL.
- `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`: pipeline único manual/programado.
- `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.ts`: upsert de `gcp_script` en `executeTask`.
- `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`: preflight/configuración/auditoría.
- `apps/api/src/modulos/reportes/infraestructura/programador-reportes.ts`: resolución de schedules vencidos.
- `apps/api/src/entradas/node.ts` y `apps/api/src/entradas/bun.ts`: arranque/parada del programador.
- `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`: selector Dataflow y preflight.
- `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`: detalle Dataflow y auditoría.
- `apps/web/src/modulos/reportes/api.ts`: cliente HTTP de nuevas operaciones.
- `apps/api/src/plataforma/persistencia/esquema.ts` + migración `0014_*`: auditoría técnica por ejecución.

---

### Task 1: Contracts and execution audit persistence

**Files:**
- Create: `packages/contratos/src/reportes/dataflow.ts`
- Modify: `packages/contratos/src/index.ts`
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Create: `apps/api/drizzle/0014_ejecuciones_reportes_dataflow.sql`
- Modify: `apps/api/src/esquema.test.ts`
**Interfaces:**
- Produces `PreflightDataflowReporte`, `DetalleEjecucionReporte`, `TipoEjecucionReporte` and table `ejecucionesReportes`.

- [ ] **Step 1: Add failing schema/contract tests**

```ts
expect(colNames(getTableConfig(ejecucionesReportes))).toEqual(
  expect.arrayContaining([
    "configuracion_id", "flujo_id_qlik", "automatizacion_id_qlik",
    "hash_dataflow_sha256", "script_dataflow", "sql_bigquery_compilado",
    "script_exportacion", "uri_base_gcs", "tipo_ejecucion", "estado",
  ]),
);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `bun test apps/api/src/esquema.test.ts packages/contratos`
Expected: FAIL because `ejecucionesReportes` and report contracts do not exist.

- [ ] **Step 3: Add the contract and Drizzle model**

```ts
export const esquemaProgramacionReporte = z.object({
  activa: z.boolean(),
  expresionCron: z.string().trim().min(9).max(100),
  zonaHoraria: z.string().trim().min(1).default("America/Guayaquil"),
});

export const esquemaPreflightDataflowReporte = z.object({
  flujoIdQlik: z.string().min(1),
  hashDataflowSha256: z.string().regex(/^[a-f0-9]{64}$/),
  compatible: z.boolean(),
  operacionesNoSoportadas: z.array(z.string()),
  sqlBigQuery: z.string(),
  bytesProcesados: z.number().nonnegative(),
  costoEstimadoUsd: z.number().nonnegative(),
  resumen: z.object({ fuentes: z.number(), filtros: z.number(), joins: z.number(), camposSalida: z.number() }),
});
```

Create `ejecuciones_reportes` with FK to `configuraciones_automatizacion`, snapshots as `text`, indexes by configuration/date and Qlik run id, and status check `preparando|iniciada|completada|error|detenida`.

- [ ] **Step 4: Generate/check migration and run tests**

Run: `bun run --cwd apps/api db:generate` only if Drizzle journal accepts generation; otherwise keep the explicit `0014` migration and run `bun test apps/api/src/esquema.test.ts && bun run typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add packages/contratos/src/reportes/dataflow.ts packages/contratos/src/index.ts apps/api/src/plataforma/persistencia/esquema.ts apps/api/src/esquema.test.ts apps/api/drizzle/0014_ejecuciones_reportes_dataflow.sql
git commit -m "feat: modelar auditoria de ejecuciones de reportes"
```

---
### Task 2: Strict Dataflow parser and semantic IR

**Files:**
- Create: `apps/api/src/modulos/reportes/dominio/plan-dataflow.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.test.ts`
- Create: `apps/api/src/modulos/reportes/fixtures/dataflow-bigquery-basico.qlik`

**Interfaces:**
- Produces `parsearDataflow(script: string): PlanDataflow`.
- `PlanDataflow` contains `fuentes`, ordered `pasos`, `salida`, and `operacionesNoSoportadas`.

- [ ] **Step 1: Add a sanitized BigQuery Dataflow fixture**

Use a read-only `GET /api/v1/apps/{id}/scripts/current` from a real BigQuery Dataflow and remove tenant/user secrets. Keep connection/table names structurally representative. The fixture must contain at least source selection, projection and one filter.

- [ ] **Step 2: Write failing parser tests**

```ts
const plan = parsearDataflow(await Bun.file(fixture).text());
expect(plan.fuentes[0]).toMatchObject({ tipo: "bigquery" });
expect(plan.pasos.map((p) => p.tipo)).toContain("filtrar");
expect(plan.salida.campos.length).toBeGreaterThan(0);
expect(plan.operacionesNoSoportadas).toEqual([]);
```

Add tests that `JOIN`, `RESIDENT`, aliases and an unknown `ApplyMap(...)` are represented explicitly; unknown operations must populate `operacionesNoSoportadas` instead of disappearing.

- [ ] **Step 3: Run parser tests and verify red**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/parser-dataflow.test.ts`
Expected: FAIL because parser/IR do not exist.

- [ ] **Step 4: Implement the minimal tokenizer/parser**

```ts
export interface PlanDataflow {
  fuentes: FuenteBigQuery[];
  pasos: PasoDataflow[];
  salida: { tablaLogica: string; campos: string[] };
  operacionesNoSoportadas: OperacionNoSoportada[];
}

export function parsearDataflow(script: string): PlanDataflow { /* parser determinista; sin eval */ }
```

Parse `LIB CONNECT`, table labels, `LOAD`, `SELECT ... FROM`, `WHERE`, `RESIDENT`, joins, aliases, grouping/order and lifecycle statements. Never execute script text and never use `eval`/`Function`.

- [ ] **Step 5: Run parser tests and commit**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/parser-dataflow.test.ts && bun run --cwd apps/api typecheck`
Expected: PASS.

```bash
git add apps/api/src/modulos/reportes/dominio apps/api/src/modulos/reportes/aplicacion/parser-dataflow* apps/api/src/modulos/reportes/fixtures
git commit -m "feat: parsear dataflows para reportes bigquery"
```

---
### Task 3: BigQuery compiler for the supported Dataflow subset

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts`

**Interfaces:**
- Consumes `PlanDataflow` from Task 2.
- Produces `compilarPlanABigQuery(plan: PlanDataflow): { sql: string; camposSalida: string[] }`.

- [ ] **Step 1: Write failing compiler tests**

```ts
const { sql } = compilarPlanABigQuery(plan);
expect(sql).toContain("WITH");
expect(sql).toContain("LEFT JOIN");
expect(sql).toContain("WHERE");
expect(sql).toContain("UPPER(");
expect(sql).toContain("CASE WHEN");
```

Cover projection/drop/rename, `= != < <= > >=`, `IN`, `IS NULL`, `AND/OR`, calculated fields, `INNER/LEFT/RIGHT/FULL JOIN`, `DISTINCT`, `SUM/COUNT/MIN/MAX/AVG`, grouping and ordering.

- [ ] **Step 2: Verify tests fail**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts`
Expected: FAIL because compiler does not exist.

- [ ] **Step 3: Implement expression translation and CTE generation**

```ts
const FUNCIONES = {
  Upper: "UPPER", Lower: "LOWER", Trim: "TRIM", Len: "LENGTH",
} as const;

export function compilarPlanABigQuery(plan: PlanDataflow) {
  if (plan.operacionesNoSoportadas.length) throw new ErrorDataflowNoCompatible(plan.operacionesNoSoportadas);
  return { sql: compilarCtes(plan), camposSalida: plan.salida.campos };
}
```

Translate `Year(x)`/`Month(x)` to `EXTRACT`, `If(c,a,b)` to `CASE WHEN`, and numeric/date casts to explicit BigQuery casts. Quote identifiers with backticks; values remain literals/parameters, never identifier interpolation.

- [ ] **Step 4: Add rejection tests**

```ts
expect(() => compilarPlanABigQuery(planConApplyMap)).toThrow("ApplyMap");
```

- [ ] **Step 5: Run and commit**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts && bun run --cwd apps/api typecheck`
Expected: PASS.

```bash
git add apps/api/src/modulos/reportes/aplicacion/compilador-bigquery*
git commit -m "feat: compilar dataflow a sql bigquery"
```

---
### Task 4: BigQuery `EXPORT DATA` wrapper with the one-million-row invariant

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv.test.ts`

**Interfaces:**
- Produces `construirScriptExportacionCsv({ sql, uriBase, maximoFilasPorArchivo?, columnasOrden? }): string`.
- Constant `MAXIMO_FILAS_EXCEL = 1_000_000`.

- [ ] **Step 1: Port behavior tests from the proven reference design**

```ts
expect(() => construirScriptExportacionCsv({ sql: "SELECT 1", uriBase, maximoFilasPorArchivo: 1_000_001 })).toThrow();
const script = construirScriptExportacionCsv({ sql: "SELECT * FROM `p.d.t`", uriBase });
expect(script).toContain("DECLARE max_rows INT64 DEFAULT 1000000");
expect(script).toContain("DIV(__reportes_export_row_number - 1, max_rows)");
expect(script).toContain("compression = 'GZIP'");
expect(script).toContain("header = true");
```

Also verify part naming `parte-001-*.csv.gz`, exclusion of internal columns and row-order preservation.

- [ ] **Step 2: Verify red**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the wrapper inside this repository**

Use the stable algorithm from `bq_reportes_creator` as reference only: temp table, `ROW_NUMBER`, logical partition, `WHILE`, `EXPORT DATA`, `CSV`, `GZIP`, `|`, header, and cleanup. Do not import files across repositories.

```ts
export const MAXIMO_FILAS_EXCEL = 1_000_000;
export function construirScriptExportacionCsv(entrada: EntradaExportacionCsv): string { /* deterministic SQL */ }
```

Reject non-GCS URIs and normalize a trailing slash. Default destination base remains outside this utility.

- [ ] **Step 4: Run boundary tests and commit**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv.test.ts && bun run --cwd apps/api typecheck`
Expected: PASS for 1, 999999, 1000000; reject 1000001 as configured block size.

```bash
git add apps/api/src/modulos/reportes/aplicacion/script-exportacion-csv*
git commit -m "feat: generar exportaciones bigquery de hasta un millon"
```

---
### Task 5: Server-side Dataflow preflight

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.test.ts`
- Create: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/modulos/reportes/api.ts`

**Interfaces:**
- Produces `PreflightDataflow.ejecutar(flujoIdQlik): Promise<PreflightDataflowReporte>`.
- HTTP: `GET /api/reportes/dataflows/:flujoId/preflight`.

- [ ] **Step 1: Write a failing application test**

```ts
const resultado = await caso.ejecutar("flujo-1");
expect(qlik.obtenerScriptApp).toHaveBeenCalledWith("flujo-1", "current");
expect(resultado.hashDataflowSha256).toMatch(/^[a-f0-9]{64}$/);
expect(resultado.sqlBigQuery).toContain("SELECT");
expect(resultado.bytesProcesados).toBe(1234);
```

Mock Qlik, parser/compiler and a BigQuery estimator. Add an incompatible-script case that returns `compatible: false` and never calls dry-run.

- [ ] **Step 2: Verify red**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement current-script hash + compile + dry-run**

```ts
export async function sha256Texto(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  return Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
}
```

The case reads current script, hashes the exact text, parses, fails closed on unsupported operations, verifies every source resolves to the tenant's configured BigQuery project/dataset (or an explicitly allowed fully-qualified BigQuery identifier), compiles SQL, calls `ClienteBigQuery.estimarConsulta(sql)` through an injected adapter, and returns summary counts.

- [ ] **Step 4: Add the authenticated route and frontend API**

```ts
export function preflightDataflowReporte(flujoId: string) {
  return clienteApi.get<PreflightDataflowReporte>(`/reportes/dataflows/${encodeURIComponent(flujoId)}/preflight`);
}
```

Resolve the tenant's default BigQuery connection server-side; the browser never submits raw SQL as authoritative input.

- [ ] **Step 5: Test route/typecheck and commit**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.test.ts apps/api/src/app.test.ts && bun run typecheck`
Expected: PASS.

```bash
git add apps/api/src/modulos/reportes apps/api/src/app.ts apps/api/src/app.test.ts apps/web/src/modulos/reportes/api.ts
git commit -m "feat: validar dataflows antes de crear reportes"
```

---
### Task 6: Persist report configuration when cloning Qlik Automate

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.ts`
- Modify: `apps/api/src/modulos/automatizaciones/http/rutas-panel.ts`

**Interfaces:**
- `PuertoRepositorioReportes.crearConfiguracion(...)` persists `flujoIdQlik` ↔ `automatizacionIdQlik`.
- `obtenerPorAutomatizacion(tenantQlikId, automatizacionIdQlik)` resolves the report at execution time.

- [ ] **Step 1: Write failing repository/use-case tests**

```ts
expect(repositorio.crearConfiguracion).toHaveBeenCalledWith(expect.objectContaining({
  flujoIdQlik: "flujo-1",
  automatizacionIdQlik: "copia-1",
  estado: "activa",
}));
```

Creation without `flujoId` must be rejected. Historical automations without an association remain readable, but no new report may be created without a Qlik Dataflow.

- [ ] **Step 2: Verify red**

Run: `bun test apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/crear-desde-plantilla.test.ts`
Expected: FAIL because report repository is not wired.

- [ ] **Step 3: Re-run server-side preflight, then persist the report configuration**

Before copying/persisting, read `scripts/current` again and execute the same strict preflight from Task 5; do not trust the browser's previous result. Reject creation if the current Dataflow became incompatible. Then persist `nombre`, organization, tenant, creator, Dataflow id/name/space, copied Qlik automation id/name, `destinoProveedor = "gcs"`, `destinoIdExterno = "gs://bkt_dwh/POCs/TalendDescargados/"`, and `estado = "activa"`.

- [ ] **Step 4: Remove SFTP/STORE-derived report configuration from cloning**

Replace the current STORE regex path. `servicio-copia-automatizacion.ts` may set only report-owned stable metadata such as `Appid`; it must not derive `Dataset`, `ArchivoEntrada`, `Extension`, table, columns or dates from SFTP/manual UI.

- [ ] **Step 5: Run tests and commit**

Run: `bun test apps/api/src/modulos/automatizaciones apps/api/src/modulos/reportes/infraestructura && bun run --cwd apps/api typecheck`
Expected: PASS.

```bash
git add apps/api/src/modulos/reportes apps/api/src/modulos/automatizaciones
git commit -m "feat: asociar reportes con dataflows y automate"
```

---
### Task 7: Single execution pipeline: refresh SQL, audit, update Automate, run

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.test.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/casos-de-uso/ejecutar-automatizacion.ts`
- Modify: `apps/api/src/modulos/automatizaciones/http/rutas-panel.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`

**Interfaces:**
- `EjecutarReporte.ejecutar({ tenantId, organizacionId, automatizacionIdQlik, usuarioId?, tipo }): Promise<{ runId: string; ejecucionReporteId: string }>`.
- `inyectarContextoTalend(workspace, valores)` upserts only the `executeTask` key/value input.

- [ ] **Step 1: Write failing workspace-injection tests**

```ts
const nuevo = inyectarContextoTalend(workspace, {
  gcp_script: "DECLARE max_rows...",
  gcp_dataflow_hash: "a".repeat(64),
});
expect(leerKv(nuevo, "executeTask", "gcp_script")).toContain("EXPORT DATA");
expect(leerKv(nuevo, "otroEndpoint", "gcp_script")).toBeUndefined();
```

This test also fixes the current overly broad `name === "executeTask" || type === "EndpointBlock"` behavior: unrelated endpoints must not be mutated.

- [ ] **Step 2: Write failing end-to-end application test with mocks**

Assert call order: lock → current script → hash → parse/compile → generate local execution UUID → export wrapper using that UUID in the GCS path → create audit row → fetch Automate workspace → update `gcp_script` → create Qlik run → mark audit row initiated.

```ts
expect(qlik.obtenerScriptApp).toHaveBeenCalledBefore(qlik.actualizarAutomatizacion);
expect(qlik.actualizarAutomatizacion).toHaveBeenCalledBefore(qlik.ejecutarAutomatizacion);
```

- [ ] **Step 3: Verify red**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.test.ts apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the pipeline under the existing advisory lock**

Build URI as `gs://bkt_dwh/POCs/TalendDescargados/<reporte-seguro>/<ejecucion-id>/`. Save exact Dataflow script, SHA-256, compiler version `1`, compiled SELECT and final export script before Qlik run creation. On any failure mark the local execution `error` with stage/message.

- [ ] **Step 5: Replace the manual execution route implementation**

`POST /api/reportes/:id/ejecuciones` must resolve the persisted report by automation id and call `EjecutarReporte` with `tipo: "manual"`; no direct `qlik.ejecutarAutomatizacion(id)` remains for report execution.

- [ ] **Step 6: Run tests and commit**

Run: `bun test apps/api/src/modulos/reportes apps/api/src/modulos/automatizaciones && bun run --cwd apps/api typecheck`
Expected: PASS including concurrent-attempt conflict test.

```bash
git add apps/api/src/modulos/reportes apps/api/src/modulos/automatizaciones
git commit -m "feat: recompilar dataflow antes de ejecutar reportes"
```

---
### Task 8: Platform-owned scheduling; disable direct Qlik schedules

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modulos/reportes/aplicacion/programacion-reporte.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/programacion-reporte.test.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/programador-reportes.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/programador-reportes.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Modify: `apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.ts`
- Modify: `apps/api/src/entradas/bun.ts`
- Modify: `apps/api/src/entradas/node.ts`

**Interfaces:**
- `calcularProximaEjecucion(expresionCron, zonaHoraria, desde): Date` using `cron-parser`.
- `ProgramadorReportes.procesarVencidas(ahora): Promise<number>` calls `EjecutarReporte` with `tipo: "programada"`.

- [ ] **Step 1: Add failing schedule calculation/claim tests**

```ts
expect(calcularProximaEjecucion("0 8 * * *", "America/Guayaquil", new Date("2026-08-14T18:00:00Z")))
  .toEqual(new Date("2026-08-15T13:00:00.000Z"));
```

Add a race test where two workers see the same due row but only one `intentarReclamarProgramacion(id, fechaEsperada, siguiente, ahora)` returns true.

- [ ] **Step 2: Verify red and add `cron-parser`**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/programacion-reporte.test.ts`
Expected: FAIL.
Then: `cd apps/api && bun add cron-parser`.

- [ ] **Step 3: Implement atomic due-schedule claiming**

Repository lists active `tipo = 'cron'` rows with `proximaEjecucionEn <= ahora`; each worker calculates next occurrence and performs a conditional update matching the exact previous `proximaEjecucionEn`. Only the successful claimant executes the report.

- [ ] **Step 4: Ensure Qlik copies cannot schedule themselves**

When updating a copied report automation, always persist `schedules: []`. Do not create new `programacionIdQlik` values for the new report flow. Historical records with `tipo = 'qlik'` remain readable but are not used for new schedules.

- [ ] **Step 5: Start scheduler only in long-lived Node/Bun entries**

Start a 30-second interval after app/bootstrap and clear it during graceful shutdown. Do not start timers in `apps/api/src/entradas/worker.ts` because request workers are not guaranteed to be long-lived.

- [ ] **Step 6: Run tests and commit**

Run: `bun test apps/api/src/modulos/reportes && bun run --cwd apps/api typecheck`
Expected: PASS.

```bash
git add apps/api/package.json bun.lock apps/api/src/modulos/reportes apps/api/src/modulos/automatizaciones/aplicacion/servicios/servicio-copia-automatizacion.ts apps/api/src/entradas/bun.ts apps/api/src/entradas/node.ts
git commit -m "feat: ejecutar programaciones desde la plataforma"
```

---
### Task 9: Redesign create/edit report UI around Dataflow selection

**Files:**
- Modify: `apps/web/src/modulos/reportes/pagina-nueva-automatizacion.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/selector-dataflow-reporte.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/resumen-preflight-dataflow.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/resumen-preflight-dataflow.test.tsx`
- Modify: `apps/web/src/modulos/reportes/api.ts`
- Modify: `packages/contratos/src/automatizaciones/panel.ts`

**Interfaces:**
- Form submits `nombre`, `flujoId`, optional `espacioIdQlik`, schedule fields and idempotency key.
- It never submits table/columns/date range/SQL as report authority.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<ResumenPreflightDataflow preflight={compatible} />);
expect(screen.getByText("Dataflow compatible")).toBeTruthy();
expect(screen.getByText(/3 filtros/)).toBeTruthy();
expect(screen.getByText(/1 join/)).toBeTruthy();
```

For incompatible preflight assert unsupported operations are visible and “Crear reporte” is disabled.

- [ ] **Step 2: Verify red**

Run: `bun run --cwd apps/web test:run -- src/modulos/reportes/componentes/resumen-preflight-dataflow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Split and simplify the 664-line creation page**

Remove BigQuery table/resource queries, `DayPicker`, manual columns, preview table and manual date range from this page. Keep report name, Qlik Dataflow selector, compatibility/preflight summary, fixed GCS destination, optional schedule and create action.

- [ ] **Step 4: Wire debounced/preselected preflight**

On `flujoId` change call `preflightDataflowReporte(flujoId)`. Show source count, fields, filters, joins, estimated bytes/USD and unsupported operations. The server re-runs preflight during creation/execution, so UI output is advisory only.

- [ ] **Step 5: Make Dataflow mandatory in the new creation contract**

Require `flujoId` for `esquemaCrearDesdePlantilla`. Keep legacy table/date/column properties optional only while old server/read code is being removed, but the new UI never sends them and the creation route never uses them. Add optional `programacion: esquemaProgramacionReporte`.

- [ ] **Step 6: Run frontend tests/build and commit**

Run: `bun run --cwd apps/web test:run && bun run --cwd apps/web typecheck`
Expected: PASS.

```bash
git add apps/web/src/modulos/reportes packages/contratos/src/automatizaciones/panel.ts
git commit -m "feat: crear reportes seleccionando un dataflow"
```

---
### Task 10: Report detail, local execution audit and schedule editor

**Files:**
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts`
- Modify: `packages/contratos/src/reportes/dataflow.ts`
- Modify: `apps/web/src/modulos/reportes/pagina-detalle-automatizacion.tsx`
- Modify: `apps/web/src/modulos/reportes/componentes/resumen-configuracion-reporte.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/auditoria-ejecucion-reporte.tsx`
- Create: `apps/web/src/modulos/reportes/componentes/auditoria-ejecucion-reporte.test.tsx`

**Interfaces:**
- `GET /api/reportes/:automatizacionId/configuracion` returns Dataflow association + schedule.
- `PUT /api/reportes/:automatizacionId/configuracion` changes only name/Dataflow/schedule/active state.
- `GET /api/reportes/:automatizacionId/ejecuciones-locales` returns audited local executions.

- [ ] **Step 1: Write failing synchronization test**

```ts
await sincronizador.ejecutar("auto-1");
expect(repositorio.marcarEstadoPorRunQlik).toHaveBeenCalledWith("run-1", "completada", expect.any(Date));
```

Map Qlik terminal states to local `completada|error|detenida`; do not overwrite `hash/script/sql` snapshots.

- [ ] **Step 2: Add route tests for editable boundaries**

Verify `PUT configuracion` accepts `{ nombre, flujoIdQlik, programacion, activa }` and rejects/ignores `sqlBigQuery`, `columnas`, `fechaDesde`, `gcp_script` and arbitrary workspace mutations.

- [ ] **Step 3: Implement local execution reads and Qlik-status reconciliation**

When listing detail/local executions, reconcile known `runIdQlik` values against Qlik run history and persist terminal states. Return hash prefix, compilation time, type, GCS URI and full audit detail on demand.

- [ ] **Step 4: Redesign detail UI**

Show Dataflow name/compatibility, Qlik automation, fixed GCS destination, schedule, detected design summary and “Ejecutar ahora”. Replace manual table/fields/period editor with report-owned configuration only.

- [ ] **Step 5: Add audit drawer/modal**

```tsx
expect(screen.getByText(/SHA-256/)).toBeTruthy();
expect(screen.getByText(/SQL compilado/)).toBeTruthy();
expect(screen.getByText(/Script enviado a Talend/)).toBeTruthy();
```

Display script snapshots in collapsed code sections; never expose OAuth tokens, service-account JSON or unrelated workspace secrets.

- [ ] **Step 6: Run backend/frontend tests and commit**

Run: `bun test apps/api/src/modulos/reportes && bun run --cwd apps/web test:run && bun run typecheck`
Expected: PASS.

```bash
git add apps/api/src/modulos/reportes packages/contratos/src/reportes apps/web/src/modulos/reportes
git commit -m "feat: mostrar auditoria y programacion de reportes"
```

---
### Task 11: Integration, regression and operational verification

**Files:**
- Create: `apps/api/src/modulos/reportes/reportes-dataflow.integration.test.ts`
- Modify: `README.md` only for the new report execution flow if its existing section is now inaccurate.
- Modify: `docs/desarrollo/puesta-en-marcha.md` only if a scheduler/dependency startup step must be documented.

**Interfaces:**
- Verifies all interfaces created in Tasks 1–10 without adding a second execution path.

- [ ] **Step 1: Add an integration test for a changed Dataflow**

```ts
qlik.obtenerScriptApp
  .mockResolvedValueOnce({ script: SCRIPT_V1 })
  .mockResolvedValueOnce({ script: SCRIPT_V2 });
await ejecutarReporte();
await ejecutarReporte();
expect(ejecuciones[0].hashDataflowSha256).not.toBe(ejecuciones[1].hashDataflowSha256);
expect(ejecuciones[1].sqlBigQueryCompilado).toContain("campo_nuevo");
```

Assert both runs use the same persisted `flujoIdQlik` but independently snapshot current script/SQL.

- [ ] **Step 2: Add manual/programmed parity test**

Run the same report once with `tipo: "manual"` and once through `ProgramadorReportes`; assert both call the same `EjecutarReporte`, refresh current script and generate `gcp_script` before Qlik run creation.

- [ ] **Step 3: Add regression assertions**

Assert new report creation still copies the tenant's configured base Qlik Automation, Talend `executeTask` remains present, Qlik Dataflow reload is never called, new report copies have `schedules: []`, and new-flow code does not derive output from `STORE ... SFTP`.

- [ ] **Step 4: Run the complete verification suite**

Run in order:

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

Expected: all exit 0. If Biome reports pre-existing unrelated files from the dirty worktree, run `biome check` on the exact files changed by this feature and record the pre-existing global failure separately; do not rewrite unrelated user changes.

- [ ] **Step 5: Controlled live smoke test**

Using a non-destructive BigQuery Dataflow/report, run preflight and one manual execution from the platform. Verify: Qlik current script hash matches audit, Qlik Automate receives `gcp_script`, Talend starts, BigQuery script reaches `EXPORT DATA`, and output URI starts with `gs://bkt_dwh/POCs/TalendDescargados/`.

Do not execute or reload the Qlik Dataflow itself. Do not alter `qlik_automate_creator` or `bq_reportes_creator`.

- [ ] **Step 6: Commit verification/docs changes**

```bash
git add apps/api/src/modulos/reportes/reportes-dataflow.integration.test.ts README.md docs/desarrollo/puesta-en-marcha.md
git commit -m "test: verificar flujo dataflow automate talend bigquery"
```

If either documentation file did not require a change, omit it from `git add` rather than touching it.

---

## Final Acceptance Checklist

- A report is created by selecting a Qlik Dataflow, not a BigQuery table/columns/date range.
- Every manual and scheduled run reads `scripts/current` before execution.
- SHA-256, script snapshot, compiled SQL and export script are stored per run.
- Unsupported Qlik operations stop execution with an actionable error.
- The SELECT is dry-run estimated before report creation/preflight.
- Qlik Automate remains the orchestrator and Talend remains the BigQuery executor.
- No new report run starts directly from a Qlik schedule.
- The logical export block size never exceeds 1.000.000 rows.
- Output uses CSV + GZIP under `gs://bkt_dwh/POCs/TalendDescargados/`.
- Two simultaneous run requests cannot cross or overwrite each other's `gcp_script`.
- Historical report/automation data remains readable without destructive migration.
