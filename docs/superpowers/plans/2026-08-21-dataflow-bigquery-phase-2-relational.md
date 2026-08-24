# Dataflow BigQuery Phase 2 — Relational/Dataflow Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cubrir los 23 procesadores visuales y operaciones relacionales Qlik con IR explícita y SQL BigQuery canónico.

**Architecture:** Extender la IR de fase 1 con Join/Union/Fork/Pivot/Unpivot/Window/Sample/Concatenate/Keep/IntervalMatch y reglas de optimización con barreras explícitas.

**Tech Stack:** Bun, TypeScript, bun:test, BigQuery GoogleSQL.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints
- Correctitud antes que aplanamiento.
- JOIN conserva pares de claves; KEEP no se implementa como JOIN destructivo.
- CTE solo por rama/reuso/barrera/legibilidad.
- No commits ni push sin permiso.

---

### Task 1: Projects, filters, aggregates, sort and distinct
- [ ] Add failing fixture goldens for filter/project/aggregate/sort/distinct.
- [ ] Parse Qlik expressions into expression AST, not string replacement.
- [ ] Lower to one SELECT when alias/order semantics permit.
- [ ] Verify NULL predicates and GROUP BY ALL behavior.

### Task 2: Qlik joins and SQL-equivalent joins
- [ ] Cover INNER/LEFT/RIGHT/FULL fixtures and composite keys.
- [ ] Resolve Qlik natural-key semantics at analysis time.
- [ ] Emit explicit aliases and ON pairs.
- [ ] Test duplicate column names and NULL join keys.

### Task 3: Concatenate, NoConcatenate, Union and auto-concatenate
- [ ] Model Qlik auto-concatenation by schema identity.
- [ ] Emit UNION ALL with schema alignment/casts where semantically valid.
- [ ] Keep NoConcatenate as a distinct symbol even with same schema.

### Task 4: KEEP
- [ ] Build paired output relations for INNER/LEFT/RIGHT KEEP.
- [ ] Use EXISTS/semi-join style lowering that preserves both tables.
- [ ] Test cardinality and duplicates.

### Task 5: Pivot/Unpivot/Crosstable/Generic
- [ ] Cover native PIVOT/UNPIVOT and Qlik Crosstable.
- [ ] Define Generic LOAD output contract (multiple logical tables) and reject single-output export if ambiguous.
- [ ] Add schema goldens.

### Task 6: Window, sample, fork and table-recipe generated scripts
- [ ] Lower windows with named partitions/order.
- [ ] Specify deterministic/non-deterministic sample semantics.
- [ ] Reuse fork relations without duplicating semantics.
- [ ] Run all processor fixtures; require 23/23 green at structural level.

### Task 7: Optimizer
- [ ] Implement safe merge rules with explicit preconditions.
- [ ] Golden-test professional SQL: minimal layers, stable names, typed literals.
- [ ] Differentially compare unoptimized vs optimized SQL results on conformance datasets.
