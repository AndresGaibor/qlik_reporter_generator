# Dataflow Real and Download Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Hacer confiable el traductor de scripts Qlik Dataflow reales y llevar `/descargas` al comportamiento robusto ya probado en `bq_reportes_creator`.

**Architecture:** El parser/compilador sigue siendo fail-closed y genera solo BigQuery SQL. La ejecución conserva `current → SQL → cuatro queries Talend → VariableBlocks Qlik Automate → Talend`. El contrato real probado usa `bq_select_data`, `bq_number_csv`, `bq_export_data` y `bq_drop`; GCS confirma finalización mediante un marcador oculto antes de habilitar descargas.

**Tech Stack:** Bun, TypeScript, Hono, React, Vitest/Bun test, Qlik Cloud API, `@google-cloud/storage`, BigQuery.

## Global Constraints

- No modificar `bq_reportes_creator` ni `qlik_automate_creator`; son referencia de solo lectura.
- Solo Qlik Cloud y Google Cloud son integraciones externas directas.
- `STORE` del Dataflow no controla el sink; GCS lo decide `qlik_reportes_creator`.
- Máximo 1.000.000 filas lógicas por bloque CSV GZIP.
- Toda ejecución relee `/scripts/current` antes de actualizar Automate.
- TDD estricto: test rojo antes de cada cambio de producción.

---

### Task 1: Convertir el script real en fixture y corregir semántica base

**Files:**
- Create: `apps/api/src/modulos/reportes/fixtures/dataflow-bigquery-filtro-fecha-real.qlik`
- Modify: `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.ts`

**Interfaces:** `parsearDataflow(script): PlanDataflow`; `compilarPlanABigQuery(plan): { sql, camposSalida }`.

- [x] Añadir fixture sanitizado equivalente al script real y tests que exijan salida `Fecha, Venta_Neta_USD`, filtro `Fecha = '6/1/2026'` y ausencia de `STORE`, `DROP`, `SET` en SQL.
- [x] Ejecutar los tests y confirmar el fallo por semántica actual.
- [x] Corregir únicamente parser/compilador para preservar la última relación almacenada como salida lógica aunque luego exista `DROP TABLE`.
- [x] Ejecutar parser + compilador + preflight y confirmar verde.
- [x] Commit `fix: compilar dataflow real con filtro resident`.

### Task 2: Soportar wildcards Qlik/BigQuery correctamente

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/parser-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-bigquery.ts`

- [x] Escribir test rojo con `LOAD *; SQL SELECT * FROM ...`.
- [x] Confirmar que hoy genera ``* AS `*` `` o equivalente inválido.
- [x] Modelar `*` como wildcard, no alias; generar `SELECT *` en fuente/proyección/final.
- [x] Añadir caso `LOAD *, Upper([x]) AS [y]` solo si el IR actual puede representarlo sin ambigüedad; de lo contrario marcarlo incompatible explícitamente.
- [x] Ejecutar suite de compilador y commit `fix: soportar wildcard en dataflows`.

### Task 3: Validar SQL real con BigQuery preflight

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/preflight-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`

- [x] Añadir test que use el fixture real completo y compruebe que el estimador recibe SQL compilado sin `STORE`.
- [x] Añadir invariantes para ruta GCS y las cuatro queries Talend con el filtro real.
- [x] Ejecutar tests focalizados.
- [x] No ejecutar BigQuery desde el agente. Validar compilación local y dejar la ejecución BigQuery real para el usuario.
- [x] Commit `test: validar pipeline con dataflow real`.

### Task 4: Portar descarga streaming de `bq_reportes_creator`

**Files:**
- Modify: `apps/web/src/modulos/descargas/descargador-secuencial.test.ts`
- Modify: `apps/web/src/modulos/descargas/descargador-navegador.test.ts`
- Modify: `apps/web/src/modulos/descargas/descargador-secuencial.ts`
- Modify: `apps/web/src/modulos/descargas/descargador-navegador.ts`
- Modify: `apps/web/src/modulos/descargas/use-descarga-ejecucion.ts`

- [x] Escribir test rojo: `showDirectoryPicker` se llama una sola vez para N archivos.
- [x] Escribir test rojo: cada `ReadableStream` se escribe chunk a chunk y no se llama `response.blob()`.
- [x] Escribir test rojo para progreso por bytes acumulados.
- [x] Portar el patrón de `bq_reportes_creator`: seleccionar carpeta una vez, `getReader()`, `createWritable()`, escribir chunks, abortar escritor ante error.
- [x] Mantener fallback con anchors espaciados cuando File System Access no existe.
- [x] Ejecutar tests de descargas y commit `fix: descargar archivos gcs por streaming`.

### Task 5: Endurecer manifests y signed URLs GCS

**Files:**
- Modify: `apps/api/src/modulos/descargas/infraestructura/cliente-gcs.test.ts`
- Modify: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.test.ts`
- Modify: `apps/api/src/modulos/descargas/infraestructura/cliente-gcs.ts`
- Modify: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.ts`

- [x] Test rojo: objetos ajenos a `parte-*.csv.gz` no aparecen en el manifest.
- [x] Test rojo: `getSignedUrl` recibe `version: v4`, `action: read` y `responseDisposition` con filename.
- [x] Implementar filtro estricto y `Content-Disposition`.
- [x] Ejecutar backend descargas y commit `fix: restringir y nombrar descargas gcs`.

### Task 6: Validar workspace real de Qlik Automate

**Files:**
- Create when available: `apps/api/src/modulos/reportes/fixtures/automate-talend-workspace.sanitized.json`
- Modify: `apps/api/src/modulos/reportes/aplicacion/servicio-contexto-talend.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`

- [x] Buscar credenciales/sesión local sin imprimir secretos; usar `~/Downloads/browser-agent-playbook` solo si hace falta autenticación interactiva.
- [x] Obtener GET de la automatización base y guardar únicamente estructura sanitizada necesaria para `executeTask`.
- [x] Testear el inyector contra la estructura real de `Test_BanCol_qlik_generator` y sus cuatro VariableBlocks.
- [x] Verificar que PUT del workspace ocurre antes de POST `/runs`.
- [x] Documentar que `finished` de Automate no prueba finalización de GCS y usar marcador `__finalizado__-*` como señal de descarga lista.
- [x] Commit `test: validar contrato real automate talend`.

### Task 7: Cerrar integración frontend relacionada y verificación

**Files:**
- Modify only if still failing: `apps/web/src/modulos/flujos/pagina-detalle-flujo.tsx`
- Modify only if still failing: `apps/web/src/modulos/reportes/componentes/detalle/configuracion-dataflow-reporte.tsx`
- Modify only if still failing: `apps/web/src/modulos/reportes/componentes/estado-preflight.tsx`

- [x] Corregir solo errores TypeScript vinculados a Dataflow moviendo imports a `@/modulos/flujos/api` y aceptando `versionMessage: string | null | undefined`.
- [x] Ejecutar API reportes/descargas, web descargas/reportes/flujos y typecheck por workspace.
- [x] No tocar errores baseline de Admin/Setup salvo que hayan sido resueltos por `main` al integrar.
- [x] Ejecutar `git diff --check`, Biome focalizado y build focalizado.
- [x] Commit `fix: cerrar integracion dataflow y descargas`.
