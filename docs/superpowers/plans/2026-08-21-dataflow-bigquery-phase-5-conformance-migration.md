# Dataflow BigQuery Phase 5 — Conformance, Certification and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demostrar paridad semántica, activar shadow mode, medir cobertura y migrar ejecución a vNext solo por superficies certificadas.

**Architecture:** A conformance harness runs tiny fixtures in Qlik and BigQuery, canonicalizes typed results and records certificates. Execution consults certificates; unsupported/uncertified constructs fail closed.

**Tech Stack:** Bun, TypeScript, Qlik APIs, BigQuery dry-run/query APIs, CI artifacts.

**Spec:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md`

## Global Constraints
- Never run conformance against production tables.
- No silent fallback from vNext to legacy.
- Certification is versioned by compiler + inventory snapshot.
- No commits/push without permission.

---

### Task 1: Conformance dataset and result canonicalizer
- [ ] Create minimal deterministic datasets for null/empty/dual/dates/joins/order/statistics.
- [ ] Canonicalize type, value, cardinality and observable order.
- [ ] Produce human-readable diffs.

### Task 2: Qlik runner and BigQuery runner
- [ ] Run isolated Qlik apps/dataflows with generated fixtures.
- [ ] Run equivalent BigQuery SQL in a dedicated test dataset.
- [ ] Capture versions, locale/timezone and execution metadata.

### Task 3: Certificates and coverage dashboard data
- [ ] Emit machine-readable certificate per construct/vector.
- [ ] Gate `supported` on green certificates.
- [ ] Report exact %, tracked %, external %, no-equivalent %.

### Task 4: Shadow mode integration
- [ ] Preflight compiles both versions without changing Talend execution.
- [ ] Persist vNext SQL/diagnostics/strategy for audit.
- [ ] Alert on semantic/structural divergence.

### Task 5: Controlled activation
- [ ] Enable vNext by certified family, not one global switch.
- [ ] Fail closed on an uncertified construct.
- [ ] Keep legacy fallback only for scripts with an explicit equivalence certificate.

### Task 6: Final acceptance
- [ ] All inventory entries classified.
- [ ] 23/23 Dataflow processors have certified structural scenarios.
- [ ] Every supported function has required semantic vectors.
- [ ] Regression `ventas_mensuales_join` produces canonical SQL preserving JOIN/WHERE/GROUP BY ALL.
- [ ] Full backend/web/build/typecheck/lint verification passes.
