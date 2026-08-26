# Schema-Aware BigQuery Compiler Design

## Goal
Evolve compiler-vNext from a mostly untyped Qlik-to-BigQuery translator into a schema-aware compiler that preserves Qlik semantics while exploiting verified BigQuery metadata for simpler SQL, stronger diagnostics, and cheaper queries.

## Constraints
- Work directly on `main`; no worktrees.
- Do not change the Dataflow to make compilation easier.
- Never guess types. Unknown or conflicting metadata falls back to current conservative Qlik lowering.
- Preserve semantic barriers: DISTINCT, FIRST, inter-record state, significant ORDER BY, mappings, duals, KEEP/CONCATENATE semantics, and other constructs where flattening can change results.
- Metadata failures must not make a previously compilable flow incompatible unless the schema proves an actual type/field error.
- Every behavior change follows RED/GREEN TDD and the existing corpus remains green.

## Architecture
Introduce a typed metadata catalog richer than the current global `fieldTypes` map. BigQuery table metadata is captured per physical source and includes type, mode, precision/scale, nested fields, partitioning, and clustering. The compiler attaches source metadata to IR relations and propagates field metadata through project/filter/join/aggregate operations.

Expression lowering consumes relation-scoped field metadata. Numeric, textual, temporal, comparison, and aggregate emitters specialize only when the input type is proven compatible; otherwise they use existing defensive Qlik conversions.

The relational optimizer uses the same metadata to validate join keys, qualify ambiguous fields, expand schemaKnown safely, prune columns, and preserve nullability through outer joins. Preflight exposes non-fatal optimization diagnostics for partition/clustering opportunities and fatal diagnostics only for proven semantic/type errors.

## Type model
A field metadata value contains at minimum: `type`, `mode`, optional `precision`, optional `scale`, and optional nested `fields`. Derived fields also track nullability/effective mode and provenance when available.

Type propagation rules cover identifiers, literals, arithmetic promotion, string functions, temporal functions, IF/Alt-style branches, aggregations, aliases, projections, filters, joins, and GROUP BY. Conflicting source metadata for an unqualified name resolves to unknown rather than choosing one side.

## Lowering improvements
- Numeric BigQuery types bypass `SAFE_CAST(CAST(... AS STRING) AS BIGNUMERIC)` where Qlik semantics do not require textual interpretation.
- STRING inputs retain defensive numeric conversion when used numerically.
- STRING functions avoid redundant `CAST(... AS STRING)` for proven STRING inputs.
- DATE/DATETIME/TIMESTAMP/TIME functions operate directly on compatible native values; unknown types retain generic Qlik conversions.
- ISO date literals are typed only against proven DATE operands; analogous safe literals are supported for DATETIME/TIMESTAMP/TIME where semantics are unambiguous.
- SUM/AVG/MIN/MAX and related aggregations use native typed arguments when safe.

## Relational improvements
- Native SQL sources become `schemaKnown` when their physical table(s) can be resolved safely.
- JOIN keys are checked for compatible types before flattening; incompatible proven types produce a compiler diagnostic rather than invalid SQL.
- Field qualification is relation-aware and ambiguous names are not emitted unqualified.
- Column pruning removes unused physical columns only across proven-safe relational layers.
- Nullability uses BigQuery `REQUIRED/NULLABLE/REPEATED` plus relational effects; outer joins make the nullable side effectively nullable.

## BigQuery physical metadata
Capture `timePartitioning`, `rangePartitioning`, and `clustering.fields`. The compiler/preflight must preserve sargable predicates on partition columns and may report warnings when a large partitioned source lacks a partition predicate. It must never rewrite a predicate in a way that disables partition pruning merely for aesthetics.

## Complex types
ARRAY/REPEATED, STRUCT/RECORD, JSON, BYTES, GEOGRAPHY and other non-scalar types are explicitly represented. Scalar-only Qlik functions reject proven incompatible complex inputs early with actionable diagnostics. Existing supported JSON functionality remains available where semantically certified.

## Safety and fallback
Metadata is an optimization and validation source, not an excuse to alter Qlik semantics. If metadata is missing, stale, ambiguous, or cannot be mapped to a relation, the compiler falls back to existing behavior. Any optimization must be monotonic with respect to correctness: more metadata may simplify SQL or detect a definite error, but absence of metadata may not invent one.
