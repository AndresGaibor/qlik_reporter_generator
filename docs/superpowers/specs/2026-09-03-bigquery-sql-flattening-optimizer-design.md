# BigQuery SQL Flattening Optimizer Design

## Goal
Make compiler-vNext emit the smallest, clearest and most optimizer-friendly BigQuery SQL that is provably equivalent to the Qlik/Dataflow semantics, eliminating redundant subqueries, CTEs, projections, aliases, filters and ordering layers while preserving every semantic barrier.

The motivating regression is a final `filter(project(native_sql))` that currently emits `SELECT * FROM (SELECT ...) AS src WHERE ...` even when it can be emitted as one flat `SELECT ... FROM ... WHERE ...`.

## Non-negotiable constraints
- Never query BigQuery, run BigQuery dry-runs, inspect live metadata, or modify any database without explicit user authorization.
- All validation for this change is local: fixtures, compiler tests, conformance/corpus tests, typecheck and static checks.
- Preserve Qlik semantics before SQL aesthetics. A required subquery/CTE stays.
- Never rewrite or bypass a BigQuery view definition automatically.
- Never replace business dimensions such as `DIM_FECHA` with inferred native functions unless the Dataflow itself expresses that transformation.
- Never remove a JOIN merely because its columns are unused; cardinality and NULL semantics may still depend on it.
- Every behavior change follows RED → GREEN → REFACTOR TDD.
- The legacy compiler remains untouched unless a separate compatibility decision explicitly requires it.
- Work is isolated on branch `feat/sql-optimizer-vnext` under `.worktrees/sql-optimizer-vnext`.

## Architecture
Split optimization into two responsibilities. The IR optimizer performs semantic rewrites on relational nodes before emission. The BigQuery emitter performs only final presentation-level flattening when the IR already proves that the transformation is safe.

The optimizer must reason using relation structure, field provenance, projection mappings, ordering, cardinality-sensitive operators and existing metadata. It must not parse generated SQL strings to guess semantics.
## Optimization model
Each relational operator is classified by what may safely pass through it:

- `native_sql`: source boundary. A simple physical `SELECT fields FROM source` may be flattened using the existing native-source recognizer; complex SQL is opaque.
- `project`: filter/projection pushdown is allowed only when every referenced output field can be substituted with a deterministic input expression and no semantic modifier blocks reordering.
- `filter`: adjacent filters can merge with `AND`; a consumer projection/aggregate may absorb the filter when its environment remains valid.
- `aggregate`: pre-aggregate predicates may live in `WHERE`; predicates over aggregate outputs are a barrier and require a post-aggregate layer or `HAVING` only when equivalence is proven.
- `join`: INNER JOIN permits side-local predicate pushdown when field provenance proves the predicate belongs to one side. Outer joins are conservative barriers except for transformations with formally safe NULL semantics.
- `union_all`: predicates/projections may distribute to branches only when field mapping is equivalent for every branch.
- `sort`: removable only if no downstream operation observes ordering. It is a barrier for FIRST/LIMIT and inter-record semantics.
- `limit`: cardinality barrier. Filters/projections cannot cross it if row selection could change.
- `stateful`: hard barrier for `RowNo`, `RecNo`, `IterNo`, `Peek`, `Previous`, `AutoNumber` and other order/state-sensitive lowering.
- `distinct`: duplicate-sensitive barrier for transformations that could change evaluated rows or expressions.
- `mapping`, dual-value internals, `semi_filter`, `unpivot`, `generic` and future operators default to conservative behavior until an explicit safety rule exists.

Unknown cases must fall back to existing SQL, not attempt speculative flattening.

## Canonical flat-query target
For a safe chain, the emitter should converge toward one logical query block with clauses in native BigQuery order:

`SELECT [DISTINCT] ... FROM ... [JOIN ...] [WHERE ...] [GROUP BY ...] [HAVING ...] [QUALIFY ...] [ORDER BY ...] [LIMIT ...]`

A query block is introduced only when crossing a semantic barrier requires it or when a shared relation is deliberately factored to avoid duplicated work.
## Required transformations
1. Flatten final `filter(project(native_sql))` into one `SELECT ... FROM ... WHERE ...` when the native source is simple and the projection is safe.
2. Merge adjacent filters into one predicate joined by `AND`, preserving parenthesization.
3. Remove identity projections and identity `SELECT *` wrappers.
4. Compose consecutive safe projections by substituting aliases with their source expressions.
5. Push predicates through safe projections by rewriting projected aliases to input expressions.
6. Keep direct partition-column predicates sargable; never wrap a proven physical partition field merely to normalize types or formatting.
7. Push INNER JOIN predicates to the referenced side only when field provenance is unambiguous and no expression depends on both sides.
8. Flatten safe INNER JOIN source/projection/filter chains into one query block.
9. Distribute safe filters/projections through `UNION ALL` only when all branches expose compatible field mappings.
10. Remove intermediate ORDER BY clauses whose ordering is not observed downstream.
11. Preserve ORDER BY when consumed by FIRST/LIMIT, inter-record operations or another construct whose semantics depend on row order.
12. Inline single-use, non-barrier subqueries/CTEs when doing so does not duplicate expensive or stateful work.
13. Continue factoring genuinely shared safe relations into CTEs when this avoids duplicate relational work.
14. Remove redundant aliases only when identifier resolution remains unambiguous.
15. Prune unused projected columns through safe relational layers when field provenance is proven.
16. Simplify harmless relational residues such as duplicate identical predicates and tautological compiler-generated `WHERE TRUE`, when present.

## Explicit semantic barriers and edge cases
- `LEFT`, `RIGHT`, and `FULL JOIN`: do not push predicates across the nullable side unless a dedicated rule proves equivalence.
- A filter after an outer join may intentionally reject NULL-extended rows and therefore must not be moved into the joined source by default.
- A filter after `LIMIT/FIRST` must remain after the limit; moving it earlier changes which rows are selected.
- A filter on an aggregate result must not be converted to pre-aggregate `WHERE`.
- `DISTINCT` must remain positioned relative to filters/projections whenever moving them could change duplicate elimination.
- Window functions and `QUALIFY` are opaque unless represented explicitly in IR with a proven safe rewrite.
- Complex native SQL containing CTEs, subqueries, comments, `DISTINCT`, set operations, `HAVING`, `QUALIFY`, `PIVOT`, `UNPIVOT`, windows or multiple statements remains opaque to structural flattening.
- Expressions with volatile/non-deterministic behavior must not be duplicated or reordered unless the compiler has explicitly classified them as safe.
- Projection substitution must respect quoted identifiers, names with spaces/accents, case behavior and aliases that collide with source fields.
- Predicate composition must preserve three-valued SQL NULL logic and Qlik comparison lowering.
- Mapping lookups and dual numeric/text components remain barriers unless the existing specialized emitter already proves a flattening safe.
- A JOIN whose right-side columns are unused is not removable without cardinality proof (for example, uniqueness of the join key), which is outside this feature.
- Views remain opaque physical sources. The optimizer may push a predicate to the view reference but may not rewrite the view body.

## Provenance and substitution rules
Safe pushdown requires knowing which input expression produces each output field. Build a projection map from output alias to source expression only for projection nodes that have no `DISTINCT`, mappings, map-substring lookups, dual internals, order dependency or other semantic modifier.

A predicate may pass through that projection only if every field reference in the predicate resolves uniquely through the projection map. Substitution must operate on parsed Qlik expressions/IR expression representations rather than blind string replacement wherever practical. If safe parsed substitution is not available for a construct, retain the layer.

For JOINs, provenance is side-aware. A predicate referencing only left fields may be pushed to the left input for INNER JOIN; likewise for the right. Predicates referencing keys/fields available from both sides, computed expressions combining sides, or ambiguous names remain above the JOIN.

## Desired motivating output
Given the observed flow, compilation must prefer:

```sql
SELECT
  `Tipo`,
  `Transacción`,
  `Año`,
  `Mes`,
  `Fecha`,
  `Bodega`,
  `Sub_bodega`
FROM `lafavorita-182519`.`EDWH_REP`.`VW_VENTAS_MENSUALES_QL`
WHERE `Fecha` = DATE '2026-06-01'
```

and must not emit the redundant `SELECT * FROM (...) AS src` wrapper for that safe shape.
## Test strategy
Golden SQL tests are the primary contract for cleanup behavior. Each optimization receives a focused RED test that first demonstrates the unwanted wrapper/layer, then the implementation makes the expected SQL exact or structurally constrained.

Required regression groups:
- motivating view + date filter case;
- filter → project → native source;
- project → filter → project alias substitution;
- multiple filters and precedence-sensitive predicates;
- identity and repeated projections;
- INNER JOIN side-local filter pushdown;
- INNER JOIN cross-side predicate retained above join;
- LEFT/RIGHT/FULL JOIN barriers;
- aggregate pre-filter versus aggregate-result filter;
- DISTINCT barrier;
- LIMIT/FIRST barrier;
- ORDER BY removable versus order-sensitive;
- UNION ALL compatible and incompatible branch mappings;
- shared relation CTE retention;
- single-use relation inlining;
- complex native SQL opacity;
- quoted identifiers, spaces, accents and alias collisions;
- NULL-sensitive comparisons;
- stateful/inter-record barriers;
- mapping and dual-value barriers.

Existing `emisor-bigquery.test.ts`, `relacional.test.ts`, corpus/conformance tests and schema-aware metadata tests remain green. No test may depend on a live BigQuery connection.

## Code organization
Keep `optimizador-ir.ts` as the orchestration entry point. If the new logic would make it substantially harder to reason about, extract focused modules under `compilador-vnext/optimizador/`, for example predicate/projection substitution, relation capability checks and rewrite passes. The emitter should consume optimized IR rather than become a second semantic optimizer.

Prefer small pure functions over mutable global state. Each rewrite pass must either return an equivalent plan or leave the input unchanged. Iterative normalization must have a finite convergence guard and transformations should be idempotent once normalized.

## Success criteria
- The motivating SQL has no redundant subquery.
- Safe common relational chains converge to a single BigQuery query block.
- Required semantic barriers still produce layers where needed.
- No optimization is based on guessing schema, uniqueness, view internals or runtime data.
- Re-running the optimizer on its own output produces no further changes for covered patterns.
- Compiler subsystem tests, conformance/corpus tests and typecheck pass locally.
- No BigQuery/database command is executed during implementation or verification.