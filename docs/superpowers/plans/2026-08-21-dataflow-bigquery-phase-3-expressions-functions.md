# Dataflow BigQuery Phase 3 — Expressions and Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el whitelist de 19 funciones por un registro declarativo de todas las entradas script-capable del inventario oficial limpio y certificar por vectores semánticos. El snapshot actual contiene 395 entradas de funciones y el contrato global 522 elementos (23 procesadores, 80 sentencias/prefijos/control-flow, 24 operadores y 395 funciones), incluidas 10 variantes regex `...I` documentadas fuera del índice principal.

**Architecture:** Expression lexer/parser + typed expression IR + function registry generated from coverage manifest. Entries begin `tracked`; only turn `supported` after reference vectors pass.

**Tech Stack:** Bun, TypeScript, BigQuery, optional Qlik conformance harness.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints
- No name-based support claims without semantic vectors.
- Preserve Qlik NULL/empty/dual/boolean semantics explicitly.
- Exactness flags distinguish exact/native/rewrite/UDF/external.
- No commits/push without permission.

---

### Task 1: Expression parser and type model
- [ ] Parse literals, identifiers, unary/binary ops, function calls, nested calls and dollar expansion references.
- [ ] Add precedence tests for numeric/string/logical/relational operators.
- [ ] Add dual/boolean/null value model metadata.

### Task 2: Generated registry
- [ ] Generate one registry entry per `qlik_function` manifest row.
- [ ] CI test registry count/name equality with inventory.
- [ ] Require strategy, signature family, determinism and vectors.

### Task 3: Core conditional/null/string/general numeric families
- [ ] Implement exact/native mappings first.
- [ ] Add normal/null/empty/boundary/type-coercion vectors for every promoted function.
- [ ] Add Unicode and regex-specific vectors.

### Task 4: Date/time and interpretation/formatting
- [ ] Model Qlik serial date/dual semantics where observable.
- [ ] Test Guayaquil timezone, UTC, leap day, month-end and DST-zone cases.
- [ ] Separate formatting-as-text from temporal value operations.

### Task 5: Aggregations, range and statistical families
- [ ] Implement native BigQuery aggregates.
- [ ] Distinguish sample/population statistics and invalid domains.
- [ ] Use SQL/JS UDF only where exact semantics are demonstrated.

### Task 6: Geospatial, financial, mapping, inter-record, system/table/file
- [ ] Classify each entry exact/rewrite/UDF/compile-time/external/no-equivalent.
- [ ] Implement semantic groups with dedicated conformance vectors.
- [ ] File/environment-dependent functions remain explicit external dependencies.

### Task 7: generated function certification gate
- [ ] Produce machine-readable status report.
- [ ] No `supported` entry may lack all required green vectors.
- [ ] Report tracked/non-equivalent/external separately; never call them supported.
