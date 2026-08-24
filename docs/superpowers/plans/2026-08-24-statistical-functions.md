# Statistical functions BigQuery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement exact BigQuery lowerings for the tracked Qlik statistical functions that are representable without approximation, and emit stable diagnostics for UDF/external semantics.

**Architecture:** Add one dedicated `estadistica.ts` module owning target classification, exact SQL formulas, arity/domain checks, and diagnostics. Integrate it in `expresiones-qlik.ts` before the existing runtime-status gate; do not modify `registro-funciones.ts` or unrelated compiler subsystems.

**Tech Stack:** TypeScript, Bun test, GoogleSQL for BigQuery, existing vNext expression emitter and `ErrorCompilacionVNext` diagnostics.

**Spec:** User request in this conversation; Qlik official statistical-function documentation and GoogleSQL reference are the semantic references.

## Global Constraints

- Scope only tracked Statistical distribution, T-test, Z-test, Chi2, LINEST/statistical, and MutualInfo functions.
- Do not use `APPROX_*` for exact Qlik functions.
- Preserve sample/population, tails, interpolation, frequency weights, and NULL/pair handling explicitly.
- Do not edit `registro-funciones.ts`.
- Do not touch mapping, inter-record, control-flow, temporal, or conformance code.
- Use `/Users/andresgaibor/.bun/bin/bun` for all test/typecheck commands.
- Run focused tests, compiler-vnext suite, API typecheck, and `git diff --check`.

### Task 1: Classification and exact statistical module skeleton

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.test.ts`

**Interfaces:**
- Produces `clasificarFuncionEstadistica(name)` returning one of `native_bigquery`, `sql_formula`, `udf_required`, or `external_non_equivalent` for every requested target.
- Produces `esFuncionEstadistica(name)` and `emitirFuncionEstadistica(name, args, modifiers, context)` for the expression emitter.

- [ ] **Step 1: Write failing classification and diagnostic tests** for every target family, including exact native `Correl`/`Stdev`, exact SQL `Fractile`/`LINEST`, UDF-required distributions/tests requiring CDF or inverse, and external `MutualInfo`.
- [ ] **Step 2: Run the focused test and verify it fails** because the module does not exist.
- [ ] **Step 3: Add the classification table, context types, stable diagnostic helpers, and target-family dispatch.** Keep unsupported targets explicit rather than falling through to generic missing implementation.
- [ ] **Step 4: Run the focused test and verify it passes.**

### Task 2: Exact scalar distributions and aggregation lowerings

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.test.ts`

**Interfaces:**
- Consumes expression emitters for Qlik numeric/value expressions and diagnostics.
- Produces exact `CORR`, `STDDEV_SAMP`, sample standard error, exact inclusive/exclusive interpolation, unbiased sample skew/kurtosis, exact regression formulas, and finite-sum Binomial/Poisson PMF/CDF formulas.

- [ ] **Step 1: Add failing SQL assertions** for NULL-safe pair aggregation, sample variance, no `APPROX_*`, inclusive rank `p*(N-1)+1`, exclusive rank `p*(N+1)`, and regression terms.
- [ ] **Step 2: Run focused tests and verify the intended failures.**
- [ ] **Step 3: Implement the minimum exact formulas**, including `DISTINCT` where Qlik supports it and explicit domain/empty/singular-result handling.
- [ ] **Step 4: Run focused tests and verify all pass.**

### Task 3: Exact one-sample, weighted, two-sample algebra, and Chi-square components

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.test.ts`

**Interfaces:**
- Produces exact algebraic components for `TTest1*`, `TTest1w*`, `TTest*`/`TTestw*` (`dif`, `df`, `sterr`, `t`), `ZTest*`/`ZTestw*` (`dif`, `sterr`, `z`), and `Chi2Test_chi2`/`Chi2Test_df`.
- Produces UDF diagnostics for p-values/confidence limits/inverse-CDF-dependent variants and for any unsupported group-order/shape semantic.

- [ ] **Step 1: Add failing tests** for sample `n-1`, frequency-weight `sum(weight)-1`, equal/unequal variance branches, two-tailed/critical-value diagnostics, and chi-square expected-cell formula.
- [ ] **Step 2: Run focused tests and verify the failures are semantic, not test errors.**
- [ ] **Step 3: Implement exact algebra**, with positive integer frequency-weight validation represented in SQL and NULL pair exclusion.
- [ ] **Step 4: Run focused tests and verify all pass.**

### Task 4: Minimal emitter integration and full verification

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/estadistica.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/expresiones-qlik.test.ts`

- [ ] **Step 1: Add the failing integration test** proving a tracked statistical function no longer trips `FUNCTION_NOT_RUNTIME_IMPLEMENTED`, while an out-of-scope tracked function remains unchanged.
- [ ] **Step 2: Run it and verify the expected failure.**
- [ ] **Step 3: Wire the dedicated module before the registry runtime gate**, without changing the registry or unrelated lowering paths.
- [ ] **Step 4: Run focused tests, the compiler-vnext suite, API typecheck, and `git diff --check`.**
- [ ] **Step 5: Inspect the final diff for forbidden files/subsystems and commit only if the sandbox permits.**
