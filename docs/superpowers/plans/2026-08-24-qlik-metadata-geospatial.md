# Qlik Metadata, Mapping and Geospatial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement exact, explicitly classified lowerings for the approved System, Table, File/QVD, inter-record metadata, MapSubstring and geospatial function scope without fabricating environment values.

**Architecture:** Add dedicated metadata and geospatial modules consumed by the existing expression emitter. Compile-time table/path facts are materialized only when provable from the IR or literal syntax; filesystem, QVD, document, user, engine and reload context remain stable diagnostics. MapSubstring gets its own mapping binding and recursive BigQuery lowering; geography uses native `GEOGRAPHY` only for functions whose semantics and return representation match, with diagnostics for Qlik-specific projection/JSON-tag behavior.

**Tech Stack:** Bun, TypeScript, bun:test, BigQuery GoogleSQL `GEOGRAPHY`.

**Spec:** Approved user request in the conversation; official Qlik function documentation and BigQuery geography documentation.

## Global Constraints

- Use `/Users/andresgaibor/.bun/bin/bun` for every Bun command.
- Do not edit `registro-funciones.ts` or `mapping-applymap.ts`.
- Do not touch ApplyMap, control-flow, temporal or conformance implementation.
- Never emit invented filesystem, document, user, engine, product or reload values.
- Emit native `GEOGRAPHY` only where Qlik semantics match exactly; otherwise emit a stable diagnostic.
- Run focused tests, the compiler-vnext suite, API typecheck, `git diff --check`; do not push.

### Task 1: Metadata and geography contracts (TDD)

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/metadata.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/geospatial.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/metadata.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/geospatial.test.ts`

- [ ] Write tests for path-only FileBaseName/FileDir/FileExtension/FileName/FilePath, explicit external diagnostics for FileSize/FileTime/QVD and environment-only System calls, and exact classification labels.
- [ ] Run focused tests and verify the new modules are absent/failing.
- [ ] Implement pure path parsing, table metadata lookup types, stable diagnostics, and exact native geography cases plus explicit unsupported cases.
- [ ] Run focused tests and verify they pass.

### Task 2: Expression integration and table metadata

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/metadata.test.ts`

- [ ] Add failing expression/compiler tests for FieldName/FieldNumber/NoOfFields/NoOfRows/NoOfTables/TableName/TableNumber and all approved System/File/QVD calls.
- [ ] Run the focused tests and confirm failures are missing lowering/diagnostics.
- [ ] Add a read-only expression environment catalog derived from `PlanCompilacionVNext`, lower known table metadata to literals or exact relation scalar counts, and route environment/file/QVD cases through dedicated diagnostics.
- [ ] Run focused tests and verify existing expression paths remain unchanged.

### Task 3: Remaining inter-record metadata

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/inter-record-metadata.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/inter-record-metadata.test.ts`

- [ ] Write failing tests for literal-field `FieldValueCount`, ordered `FieldValue`/`FieldIndex` on an inline load, exact `LookUp` over an earlier ordered table, and diagnostics for unknown/current chart scope or unordered sources.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement only proven load-order/table cases with scalar subqueries; reject unsupported chart/model cases rather than approximating symbol-table order.
- [ ] Run focused tests and verify `inter-record.ts` behavior is unchanged.

### Task 4: MapSubstring and end-to-end geography

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/mapping-mapsubstring.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/ir.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/analizador-semantico.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/mapping-mapsubstring.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/funciones-fixtures.test.ts`

- [ ] Write failing tests for case-sensitive, left-to-right, non-iterative MapSubstring and native geography lowering/diagnostics.
- [ ] Run focused tests and confirm missing binding/lowering failures.
- [ ] Resolve MAPPING tables without changing ApplyMap code; emit recursive BigQuery SQL only for a proven mapping binding and use the dedicated geography module for supported native cases.
- [ ] Run focused tests and verify ordinary mappings and SQL remain unchanged.

### Task 5: Verification and local commit

- [ ] Run focused metadata/mapping/geography tests.
- [ ] Run all compiler-vnext tests.
- [ ] Run API typecheck with the required Bun binary.
- [ ] Run `git diff --check` and inspect changed paths, ensuring `registro-funciones.ts`, ApplyMap, control-flow, temporal and conformance files are untouched.
- [ ] Commit locally if the sandbox permits; never push.
