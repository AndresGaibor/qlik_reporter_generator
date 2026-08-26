# Schema-Aware BigQuery Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compiler-vNext consume and propagate verified BigQuery schema/physical metadata to simplify SQL, validate semantics, and improve query efficiency.

**Architecture:** Replace the global name→type hint with relation-aware typed metadata, propagate it through the IR, then specialize expression and relational lowering. Keep all existing conservative fallbacks and semantic barriers.

**Tech Stack:** TypeScript, Bun, BigQuery Node client, compiler-vNext IR/emitter, Biome, tsc.

**Spec:** `docs/superpowers/specs/2026-08-25-schema-aware-bigquery-compiler-design.md`

## Global Constraints
- Directly on `main`; no worktrees.
- Never infer a BigQuery type without metadata evidence.
- Existing Qlik semantics and fallback lowering remain authoritative when metadata is unavailable.
- TDD RED/GREEN for each behavior; relevant corpus + `tsc --noEmit` + Biome before each commit.
- Do not include unrelated existing changes in `AGENTS.md` or `parser-dataflow.ts`.

---

### Task 1: Rich BigQuery metadata contract
**Files:** `estimador-bigquery.ts`, `estimador-bigquery.test.ts`, preflight contracts, new compiler metadata type module.
**Produces:** relation/source metadata including field type, mode, precision, scale, nested fields, partitioning, clustering.
- [ ] Add failing tests for rich metadata extraction and fully-qualified tables.
- [ ] Implement typed metadata extraction while preserving current compatibility or migrating callers atomically.
- [ ] Verify metadata failures remain non-fatal fallbacks.
- [ ] Run tests/typecheck/Biome and commit.

### Task 2: Relation-scoped metadata and IR propagation
**Files:** `ir.ts`, semantic analyzer state/control/load modules, compiler index/options, emitter environments, focused tests.
**Consumes:** Task 1 source metadata.
**Produces:** typed fields per relation plus propagation through project/filter/join/aggregate.
- [ ] RED tests for same field name with different types on different sources.
- [ ] RED tests for derived Year→INT64, Upper→STRING, SUM→numeric metadata.
- [ ] Implement conservative type propagation and provenance.
- [ ] Model effective nullability across outer joins.
- [ ] Verify unknown/conflict becomes unknown, not guessed.
- [ ] Run tests/typecheck/Biome and commit.

### Task 3: Numeric and aggregation specialization
**Files:** `core-valores.ts`, `numericas.ts`, `agregaciones.ts`, numeric/aggregate tests.
**Consumes:** relation-scoped field metadata.
- [ ] RED tests proving INT64/NUMERIC/BIGNUMERIC/FLOAT64 avoid string round-trips.
- [ ] Keep STRING numeric fallback via SAFE_CAST.
- [ ] Implement safe numeric promotion for arithmetic and native SUM/AVG/MIN/MAX arguments.
- [ ] Cover Range numeric functions where type proof is sufficient.
- [ ] Run relevant tests/typecheck/Biome and commit.

### Task 4: Text and temporal specialization
**Files:** text/core emitters, temporal conversion/calendar/context/format modules, dispatcher only if required, tests.
**Consumes:** relation-scoped field metadata.
- [ ] RED tests proving STRING avoids redundant casts.
- [ ] RED tests for DATE/DATETIME/TIMESTAMP/TIME native lowering across common temporal functions.
- [ ] Preserve timezone-sensitive semantics for TIMESTAMP and generic fallback for unknowns.
- [ ] Add safe typed temporal literals where BigQuery/Qlik semantics are unambiguous.
- [ ] Run relevant tests/typecheck/Biome and commit.

### Task 5: SchemaKnown, JOIN validation, qualification, column pruning
**Files:** IR optimizer, BigQuery emitter source/join/project modules, relational tests.
**Consumes:** typed relation metadata.
- [ ] RED tests for compatible and incompatible JOIN key types.
- [ ] RED tests for ambiguous same-name fields requiring qualification.
- [ ] Mark resolvable native sources schemaKnown and reject proven missing fields early.
- [ ] Implement safe column pruning across fusion-safe layers only.
- [ ] Keep DISTINCT/FIRST/inter-record/mapping/dual/order barriers.
- [ ] Run relational/corpus tests/typecheck/Biome and commit.

### Task 6: Nullability and complex-type diagnostics
**Files:** type metadata helpers, condition/text/numeric emitters, diagnostics tests.
**Consumes:** mode/effective nullability/nested type metadata.
- [ ] RED tests for REQUIRED-vs-NULLABLE simplifications that are semantics-preserving.
- [ ] RED tests for outer-join nullable-side behavior.
- [ ] RED tests for scalar functions on ARRAY/STRUCT/GEOGRAPHY/BYTES incompatible inputs.
- [ ] Implement early actionable diagnostics without blocking unknown types.
- [ ] Run tests/typecheck/Biome and commit.

### Task 7: Partition and clustering awareness
**Files:** BigQuery metadata contract, preflight result/internal diagnostics, optimizer predicate handling, tests.
**Consumes:** table partition/clustering metadata.
- [ ] RED tests that partition predicates remain sargable and unwrapped.
- [ ] Add non-fatal diagnostics for missing partition filters where detectable.
- [ ] Preserve/encourage clustering-friendly equality/range predicates without semantic rewrites.
- [ ] Verify no query becomes less selective or changes semantics.
- [ ] Run tests/typecheck/Biome and commit.

### Task 8: Whole-compiler regression and SQL-quality gates
**Files:** regression fixtures/tests, conformance gates as needed.
- [ ] Add schema-aware Ventas regression asserting native numeric aggregates, typed DATE filters, direct temporal extraction, qualified JOIN columns, and no redundant casts/subqueries.
- [ ] Add unknown-schema regression asserting conservative old fallback remains.
- [ ] Run complete compiler-vNext suite, API typecheck, Biome, and existing corpus/conformance gates.
- [ ] Run Codex/Luna whole-branch review, address load-bearing findings, re-run full verification.
- [ ] Commit final regression/review fixes.
