# Trazabilidad de Ejecuciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar la trazabilidad recuperable de cada ejecución desde Qlik hasta BigQuery y GCS, y exponer sus métricas en API y UI.

**Architecture:** `ejecucionId` permanece como raíz de correlación y determina un `jobId` BigQuery. Un sincronizador separado consulta exclusivamente metadata de jobs, normaliza el job principal e hijos y persiste el estado idempotentemente; el polling Qlik y el servicio de descargas conservan sus responsabilidades. Los contratos exponen datos normalizados desde PostgreSQL y GCS solo aporta los archivos y marcador de finalización.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, Zod, React, TanStack Query, Google BigQuery SDK.

**Spec:** `docs/superpowers/specs/2026-08-25-trazabilidad-ejecucion-design.md`

## Global Constraints

- No ejecutar consultas BigQuery, `SELECT`, `EXPORT DATA` ni crear jobs; solo metadata de jobs, mocks y fixtures.
- Mantener `ejecucionId`, `runIdQlik` y `jobIdBigQuery` como identidades independientes.
- Preservar precisión de bytes y slot-ms usando strings decimales fuera de PostgreSQL.
- No revertir, editar ni incluir en commits cambios ajenos ya presentes en el árbol de trabajo.
- No bloquear una descarga completada por GCS si la observabilidad BigQuery está temporalmente no disponible.
- Aplicar TDD: cada cambio de producción comienza con una prueba que falle por el comportamiento requerido.

---

### Task 1: Consolidar el repositorio de ejecuciones y metadata BigQuery

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Test: `apps/api/src/esquema.test.ts`
- Create: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`

**Interfaces:**
- Consumes: `jobsBigQueryEjecucion` y columnas de correlación ya migradas.
- Produces: lectura de ejecuciones correlacionadas y `guardarJobBigQueryEjecucion()` idempotente por `projectId`, `location` y `jobId`.

- [ ] **Step 1: Escribir pruebas fallidas** para upsert idempotente, persistencia de métricas como strings, timestamps y relación `parentJobId`.
- [ ] **Step 2: Ejecutar las pruebas** y confirmar que fallan por no existir el contrato/método de persistencia.
- [ ] **Step 3: Añadir el tipo de job persistido y los métodos mínimos** para listar ejecuciones con `jobIdPrincipalBigQuery` y guardar jobs por clave natural.
- [ ] **Step 4: Implementar el mapeo Drizzle/PostgreSQL** sin convertir bytes ni slot-ms a `number`.
- [ ] **Step 5: Ejecutar pruebas de esquema y repositorio** y confirmar verde.

### Task 2: Sincronizar metadata del job BigQuery

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/sincronizar-jobs-bigquery-ejecucion.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/sincronizar-jobs-bigquery-ejecucion.test.ts`
- Modify: `apps/api/src/modulos/google-cloud/aplicacion/puerto-jobs-bigquery.ts`
- Modify: `apps/api/src/modulos/google-cloud/infraestructura/cliente-jobs-bigquery.ts`
- Create: `apps/api/src/modulos/google-cloud/infraestructura/cliente-jobs-bigquery.test.ts`

**Interfaces:**
- Consumes: `PuertoJobsBigQuery.obtenerJob`, `listarHijos` y los métodos de Task 1.
- Produces: `SincronizarJobsBigQueryEjecucion.sincronizar(ejecucionId)` que actualiza job principal e hijos sin duplicados.

- [ ] **Step 1: Escribir pruebas fallidas** para job `RUNNING`, `DONE`, error BigQuery, 404 temporal y parent/child.
- [ ] **Step 2: Ejecutar las pruebas** y comprobar que fallan por no existir el caso de uso.
- [ ] **Step 3: Normalizar metadata del cliente** con `creationTime`, `startTime`, `endTime`, duración, métricas, estado y errores; garantizar que solo use APIs de lectura.
- [ ] **Step 4: Implementar el sincronizador**: no marcar error ante `null`; calcular duración desde timestamps remotos; actualizar timestamps globales BigQuery; almacenar hijos si el adaptador los devuelve.
- [ ] **Step 5: Ejecutar las pruebas unitarias** y confirmar idempotencia y preservación de precisión.

### Task 3: Orquestar Qlik, BigQuery y GCS de manera recuperable

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts`
- Modify: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.ts`
- Modify: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts`

**Interfaces:**
- Consumes: `SincronizarJobsBigQueryEjecucion`, ejecución persistida y detección existente del marcador `__finalizado__`.
- Produces: polling que recupera una ejecución tras reinicio y solo completa por GCS cuando BigQuery no esté disponible temporalmente.

- [ ] **Step 1: Escribir pruebas fallidas** de recuperación sin estado en memoria, BigQuery terminado más marcador GCS y metadata temporalmente ausente más marcador GCS.
- [ ] **Step 2: Ejecutar las pruebas** y confirmar la ausencia del comportamiento.
- [ ] **Step 3: Invocar el sincronizador BigQuery desde el polling** exclusivamente cuando la ejecución tenga project y job conocidos.
- [ ] **Step 4: Actualizar la finalización GCS** para persistir `gcsFinalizadoEn`, mantener una ejecución descargable sin metadata y no sobrescribir errores más específicos.
- [ ] **Step 5: Ejecutar pruebas de sincronización y descargas** y confirmar verde.

### Task 4: Exponer detalle técnico y métricas en los contratos API

**Files:**
- Modify: `packages/contratos/src/reportes/dataflow.ts`
- Modify: `packages/contratos/src/descargas/index.ts`
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes.ts`
- Modify: `apps/api/src/modulos/descargas/http/rutas-descargas.ts`
- Test: `packages/contratos/src/reportes/dataflow.test.ts`
- Test: `packages/contratos/src/descargas/index.test.ts`

**Interfaces:**
- Consumes: ejecuciones y jobs enriquecidos por Tasks 1-3.
- Produces: `jobIdBigQuery`, `runIdQlik`, duraciones, métricas agregadas y arreglo de jobs BigQuery en respuestas validadas por Zod.

- [ ] **Step 1: Escribir pruebas Zod fallidas** para bytes/slot-ms string, nulos válidos y detalle de jobs hijos.
- [ ] **Step 2: Ejecutar las pruebas** y comprobar que los campos aún no son aceptados.
- [ ] **Step 3: Extender schemas** con campos técnicos y métricas calculadas sin convertir valores grandes a `number`.
- [ ] **Step 4: Mapear las respuestas HTTP** desde el repositorio, usando DB como fuente de metadata y GCS solo para archivos.
- [ ] **Step 5: Ejecutar pruebas de contratos y rutas** y confirmar verde.

### Task 5: Mostrar métricas en historial y descargas

**Files:**
- Modify: `apps/web/src/modulos/reportes/`
- Modify: `apps/web/src/modulos/descargas/api.ts`
- Modify: `apps/web/src/modulos/descargas/pagina-descargas.tsx`
- Test: pruebas existentes de los módulos o nuevas pruebas focalizadas de renderizado.

**Interfaces:**
- Consumes: contratos de Task 4.
- Produces: duración total/BigQuery, bytes, estado, `jobId`, `runIdQlik`, URI GCS y archivos por ejecución, con IDs en detalle técnico y controles de copia.

- [ ] **Step 1: Escribir pruebas de renderizado fallidas** para una ejecución completada con métricas y una sin metadata BigQuery.
- [ ] **Step 2: Ejecutar las pruebas** y confirmar que no se muestran métricas.
- [ ] **Step 3: Resolver los conflictos de descargas preservando ambas intenciones funcionales**, validando primero las secciones en conflicto.
- [ ] **Step 4: Adaptar los clientes y vistas** para mostrar una síntesis legible y detalle técnico copiable, sin mostrar IDs largos como contenido principal.
- [ ] **Step 5: Ejecutar las pruebas del frontend** y confirmar la vista móvil y escritorio.

### Task 6: Verificación integral y aislamiento de cambios

**Files:**
- Verify only: paths modificados por Tasks 1-5.

- [ ] **Step 1: Ejecutar suites relevantes** de API, contratos y web.
- [ ] **Step 2: Ejecutar typecheck** con `npx tsc --noEmit` en los paquetes que lo definan.
- [ ] **Step 3: Ejecutar Biome** sobre los archivos modificados y corregir formato sin tocar archivos ajenos.
- [ ] **Step 4: Revisar `git diff --stat` y `git status --short`** para verificar que solo las rutas de trazabilidad son candidatas a futuros commits.
- [ ] **Step 5: Reportar evidencia** incluyendo tests, typecheck, Biome y la confirmación de cero consultas BigQuery con costo.
