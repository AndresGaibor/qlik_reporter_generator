# Dataflow BigQuery Phase 4 — Stateful Semantics, Control Flow and Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traducir o diagnosticar las sentencias Qlik que requieren estado, múltiples relaciones, control de flujo, mappings o efectos externos.

**Architecture:** Program IR separates relational nodes from script effects. Compile-time branches are folded; data-dependent control uses BigQuery scripting/temp tables when exact; external effects use explicit adapters or diagnostics.

**Tech Stack:** Bun, TypeScript, BigQuery multi-statement SQL/UDFs.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints
- No simulated external I/O hidden inside SQL.
- Ordering-sensitive functions require proven order.
- Effects remain auditable.
- No commits/push without permission.

---

### Task 1: SET/LET/dollar expansion and environment
- [ ] Implement value vs textual assignment semantics.
- [ ] Apply DateFormat/NullAsNull/NullAsValue/etc. to semantic environment.
- [ ] Detect recursive/undefined variable expansion.

### Task 2: Mapping/ApplyMap and Exists
- [ ] Model mapping tables and lookup defaults.
- [ ] Lower to joins/subqueries preserving duplicate and missing-key semantics.
- [ ] Model Exists with load-order awareness; reject when order cannot be reproduced.

### Task 3: Peek/Previous/counters/AutoNumber
- [ ] Require deterministic row order for inter-record semantics.
- [ ] Use windows when exact; materialize when necessary.
- [ ] Specify AutoNumber stability scope and Hash alternatives.

### Task 4: Hierarchy/HierarchyBelongsTo/IntervalMatch
- [ ] Use recursive CTE for hierarchy.
- [ ] Detect cycles/depth semantics.
- [ ] Lower interval matching with boundary and duplicate tests.

### Task 5: IF/SWITCH/FOR/DO/SUB/CALL
- [ ] Fold compile-time branches.
- [ ] Emit BigQuery scripting for data-independent loops where bounded/exact.
- [ ] Reject unsafe/unbounded or side-effect-dependent control flow explicitly.

### Task 6: DROP/RENAME/QUALIFY/TAGS/TRACE/STORE
- [ ] Keep symbol-table effects separate from SQL.
- [ ] Treat metadata-only operations as audited no-op.
- [ ] Route STORE through export layer rather than pretending it is relational SQL.

### Task 7: External/partial-reload/file/system semantics
- [ ] Classify FileList/FileSize/etc. as external unless an adapter is configured.
- [ ] Implement partial reload only with an explicit snapshot contract; otherwise reject.
- [ ] Add stable diagnostics and suggested remediation.
