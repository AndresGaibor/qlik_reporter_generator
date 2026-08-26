# Trazabilidad completa de ejecuciones Qlik Report → BigQuery → GCS

**Fecha:** 2026-08-25
**Tipo:** Arquitectura
**Estado:** Aprobado

---

## 1. Objetivo

Cada ejecución de reporte debe responder inequívocamente:

- ¿Cuál ejecución interna de Qlik Report la lanzó?
- ¿Quién la lanzó?
- ¿Qué Dataflow la originó?
- ¿Qué Automation worker se utilizó?
- ¿Cuál fue el `runId` de Qlik Automate?
- ¿Qué `jobId` envió la plataforma a Talend/BigQuery?
- ¿Qué jobs BigQuery se ejecutaron realmente?
- ¿Cuándo comenzó y terminó cada etapa?
- ¿Cuánto demoró cada etapa?
- ¿Cuánto demoró en aparecer el archivo en GCS?
- ¿Cuántos bytes procesó/facturó BigQuery?
- ¿Cuántos slot-ms consumió?
- ¿En qué proyecto/location se ejecutó?
- ¿Cuál fue la carpeta GCS exacta?

---

## 2. Modelo mental de IDs

| ID | Propósito | Formato |
|---|---|---|
| `ejecucionId` | ID canónico de la ejecución completa | UUID generado en `ejecutar-reporte.ts` |
| `runIdQlik` | ID de la ejecución de Qlik Automate | String de Qlik |
| `jobIdBigQuery` | ID enviado por nuestra plataforma a Talend | `"qlikr_" + ejecucionId.replace(/-/g, "").slice(0, 24)` |

**Restricción:** `jobId` ≠ `runIdQlik`. Son identidades independientes. `ejecucionId` es la raíz de correlación.

---

## 3. Modelo de datos

### 3.1 Tabla `jobs_bigquery_ejecucion` (nueva)

```sql
CREATE TABLE jobs_bigquery_ejecucion (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_reporte_id        UUID NOT NULL REFERENCES ejecuciones_reportes(id),
  job_id                      TEXT NOT NULL,
  parent_job_id               TEXT,
  project_id                  TEXT NOT NULL,
  location                    TEXT DEFAULT 'US',
  tipo                        TEXT NOT NULL CHECK (tipo IN (
    'principal', 'script', 'query', 'export', 'conteo', 'child', 'desconocido'
  )),
  estado                      TEXT NOT NULL CHECK (estado IN (
    'pendiente', 'running', 'done', 'error'
  )),
  creation_time               TIMESTAMPTZ,
  start_time                  TIMESTAMPTZ,
  end_time                    TIMESTAMPTZ,
  duracion_ms                 BIGINT,
  total_bytes_processed       TEXT,  -- string para precisión > Number.MAX_SAFE_INTEGER
  total_bytes_billed         TEXT,
  total_slot_ms               TEXT,
  cache_hit                   BOOLEAN,
  statement_type              TEXT,
  error_reason                TEXT,
  error_message               TEXT,
  metadata_json               JSONB,
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_project_location UNIQUE (project_id, location, job_id)
);

CREATE INDEX idx_jobs_ejecucion_reportes ON jobs_bigquery_ejecucion(ejecucion_reporte_id);
CREATE INDEX idx_jobs_job_id ON jobs_bigquery_ejecucion(job_id);
CREATE INDEX idx_jobs_estado ON jobs_bigquery_ejecucion(estado);
```

### 3.2 Extensión `ejecuciones_reportes`

Nuevas columnas nullable:

```sql
ALTER TABLE ejecuciones_reportes ADD COLUMN job_id_principal_bigquery  TEXT;
ALTER TABLE ejecuciones_reportes ADD COLUMN bigquery_project_id        TEXT;
ALTER TABLE ejecuciones_reportes ADD COLUMN bigquery_location          TEXT;
ALTER TABLE ejecuciones_reportes ADD COLUMN qlik_iniciado_en         TIMESTAMPTZ;
ALTER TABLE ejecuciones_reportes ADD COLUMN bigquery_iniciado_en      TIMESTAMPTZ;
ALTER TABLE ejecuciones_reportes ADD COLUMN bigquery_finalizado_en     TIMESTAMPTZ;
ALTER TABLE ejecuciones_reportes ADD COLUMN gcs_finalizado_en         TIMESTAMPTZ;
```

---

## 4. Etapas de ejecución

```
preparación    → creadoEn (ya existe)
qlik_iniciado  → qlikIniciadoEn (momento en que Qlik confirma run)
bigquery       → bigqueryIniciadoEn + bigqueryFinalizadoEn
gcs_finalizado → gcsFinalizadoEn
completada     → finalizadoEn (ya existe)
```

---

## 5. Puerto `PuertoJobsBigQuery`

```ts
export interface MetadatoJobBigQuery {
  jobId: string;
  projectId: string;
  location: string;
  estado: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  creationTime: string;
  startTime: string | null;
  endTime: string | null;
  totalBytesProcessed: string | null;  -- string para precisión
  totalBytesBilled: string | null;
  totalSlotMs: string | null;
  cacheHit: boolean | null;
  statementType: string | null;
  errorResult: { reason: string; message: string } | null;
  parentJobId: string | null;
}

export interface PuertoJobsBigQuery {
  obtenerJob(input: {
    projectId: string;
    jobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery | null>;

  listarHijos?(input: {
    projectId: string;
    parentJobId: string;
    location?: string;
  }): Promise<MetadatoJobBigQuery[]>;
}
```

---

## 6. Adaptador `ClienteJobsBigQuery`

Ubicación: `apps/api/src/modulos/google-cloud/infraestructura/cliente-jobs-bigquery.ts`

- Usa `@google-cloud/bigquery` existente
- Solo lee metadata via `job.getMetadata()` — no ejecuta SQL
- `location` por defecto: `undefined` (la librería usa el default del proyecto)
- Traduce `statistics.query.*` a strings para evitar pérdida de precisión

---

## 7. Caso de uso `SincronizarJobsBigQueryEjecucion`

Responsabilidad: dada una `ejecucionId` con `jobId` conocido, obtener metadata del job y sus hijos, persistir/actualizar en `jobs_bigquery_ejecucion` (upsert por `projectId + location + jobId`). Es idempotente.

**Reglas de negocio:**
- Si `jobs.get` devuelve 404 → estado `pendiente`, no error
- Si job principal = `DONE` y `errorResult` presente → estado `error`
- Si job principal = `DONE` sin error → `done`
- Si Qlik = `completed` Y GCS = finalizado Y no hay metadata BigQuery → completar igualmente

---

## 8. Contrato Talend — Inyección de `jobid` y `projectid`

### Fixture actual

```json
{
  "blocks": [
    { "name": "executeTask", "type": "EndpointBlock", "inputs": [...] },
    { "name": "Credenciales", "type": "VariableBlock", ... },
    { "name": "BqNumberCsv", "type": "VariableBlock", ... },
    { "name": "BqExportData", "type": "VariableBlock", ... }
  ]
}
```

### Cambio requerido

Se añadirán VariableBlocks `JobId` y `ProjectId` al workspace, y se referenciarán en `executeTask.inputs.context`:

```json
[
  { "key": "credenciales",  "value": "{ $.Credenciales }" },
  { "key": "bq_number_csv", "value": "{ $.BqNumberCsv }" },
  { "key": "bq_export_data","value": "{ $.BqExportData }" },
  { "key": "jobid",         "value": "{ $.JobId }" },
  { "key": "projectid",     "value": "{ $.ProjectId }" }
]
```

Los VariableBlocks `JobId` y `ProjectId` con `set_value` se crean e injectan en el workspace antes de actualizar la automatización.

---

## 9. Secuencia en `EjecutarReporte`

```
generar ejecucionId (= UUID)
↓
derivar jobId = "qlikr_" + ejecucionId.replace(/-/g, "").slice(0, 24)
↓
persistir ejecución (estado preparando, job_id_principal = jobId, bigquery_project_id)
↓
inyectar JobId + ProjectId + BqNumberCsv + BqExportData en Automation
↓
ejecutar Automation → obtener runIdQlik
↓
persistir runIdQlik + qlik_iniciado_en
```

---

## 10. Contratos Zod

### `packages/contratos/src/reportes/dataflow.ts`

En `DetalleEjecucionReporteDataflow`:

```ts
jobIdBigQuery:       string | null
bigQueryProjectId:   string | null
bigQueryLocation:    string | null

metricas: {
  duracionTotalMs:      number | null
  duracionBigQueryMs:   number | null
  totalBytesProcessed:  string | null
  totalBytesBilled:    string | null
  totalSlotMs:          string | null
}

jobsBigQuery: Array<{
  jobId: string
  parentJobId: string | null
  tipo: string
  estado: string
  startTime: string | null
  endTime: string | null
  duracionMs: number | null
  totalBytesProcessed: string | null
  totalBytesBilled: string | null
  totalSlotMs: string | null
}>
```

### `packages/contratos/src/descargas/index.ts`

En `ResumenDescargaEjecucion`:

```ts
jobIdBigQuery:        string | null
duracionTotalMs:      number | null
duracionBigQueryMs:   number | null
totalBytesProcessed:  string | null
totalSlotMs:          string | null
```

---

## 11. Tests

1. `servicio-contexto-talend.test.ts` — `jobid` se inyecta derivado del `ejecucionId`
2. `servicio-contexto-talend.test.ts` — `projectid` se inyecta con el projectId del tenant
3. `ejecutar-reporte.test.ts` — correlación `ejecucionId ↔ jobId ↔ uriBaseGcs`
4. `cliente-jobs-bigquery.test.ts` — mock `jobs.get` con metadata, verifica duración/bytes
5. `sincronizar-jobs.test.ts` — job done + children + upsert idempotente
6. `sincronizar-jobs.test.ts` — job error → estado `error`
7. `sincronizar-jobs.test.ts` — 404 → `pendiente`
8. `sincronizar-ejecucion-completa.test.ts` — restart recovery

---

## 12. Commits recomendados

```
feat(reportes): persist BigQuery job correlation

feat(reportes): inject execution job id into Talend

feat(bigquery): collect execution job metrics

feat(reportes): synchronize Qlik BigQuery and GCS execution state

feat(descargas): expose execution performance metrics

feat(web): show report execution metrics
```

---

## 13. Criterios de aceptación

1. `jobid` se genera antes de lanzar Qlik
2. `jobid` se inyecta en Automation/Talend
3. `projectid` se inyecta explícitamente
4. `jobid` queda persistido en `ejecuciones_reportes.job_id_principal_bigquery`
5. `runIdQlik` queda persistido independientemente
6. carpeta GCS queda vinculada por `ejecucionId`
7. se recuperan métricas BigQuery mediante `jobId` sin re-ejecutar SQL
8. start/end reales se guardan
9. duración BigQuery se calcula
10. bytes processed/billed se guardan como string
11. totalSlotMs se guarda
12. errores BigQuery se guardan
13. parent/child jobs se persisten si existen
14. restart de API no pierde correlación
15. tests pasan, typecheck pasa, Biome pasa
16. no se incluyeron cambios ajenos del working tree
17. consultas BigQuery con costo ejecutadas: 0
