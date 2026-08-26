# Gates de conformance y certificación del compilador vNext

## Propósito

Este gate verifica el contrato del corpus y la calidad estructural del SQL. No
ejecuta Qlik, no inventa resultados Qlik y no convierte una compilación exitosa
en certificación semántica.

La fuente de verdad de los tamaños del inventario sigue siendo
`coverage-manifest.json`; el estado de runtime sigue siendo
`runtime-function-status.json`; los vectores siguen siendo
`function-vectors.json`; y los escenarios ejecutables siguen siendo
`scenarios.json`. Los tests calculan los conteos a partir de sus listas y solo
usan los conteos declarados para detectar drift.

## Estados y métricas

`conformance-gates.ts` emite un reporte JSON con cuatro métricas separadas:

- `tracked`: entradas del inventario oficial.
- `implemented`: funciones con `implemented_unverified` en el inventario de
  runtime. Implementación no implica equivalencia.
- `certified`: certificados con target conocido, `reference` y `golden` no
  vacíos; un registro incompleto nunca incrementa esta métrica.
- `intentionally_non_equivalent`: escenarios declarados explícitamente como
  no equivalentes, con razón y referencia.

Los valores no se duplican como constantes en los tests. El reporte también
expone conteos por superficie, estados de runtime, escenarios compilados o
rechazados, certificados, no-equivalencias y resultados de calidad SQL. Una
ejecución desconocida, duplicada u omitida produce una violación en lugar de
desaparecer silenciosamente.

## Certificación

El catálogo empieza sin certificados (`certificates: []`). Para agregar uno,
su registro debe incluir:

```json
{
  "id": "scenario:ejemplo",
  "reference": "qlik/ejemplo.qlik",
  "golden": "goldens/ejemplo.sql"
}
```

El gate rechaza registros sin `reference` o `golden`, y rechaza targets
desconocidos o conflictos con una no-equivalencia. Una implementación o un
SQL compilable sin un golden concreto permanece sin certificar.

## Calidad SQL canónica

Las reglas de `sql_quality` son aserciones estructurales, no comparaciones de
texto completo. Permiten exigir cláusulas nativas y limitar complejidad:

- la regresión `regression-ventas-mensuales-join` debe conservar `INNER JOIN`,
  `WHERE` y `GROUP BY ALL`;
- `qlik-filter-project` debe permanecer como una SELECT plana, sin CTE,
  subquery, `CASE`, `CAST` ni capas sintéticas;
- las variantes nativas INNER/LEFT/RIGHT/FULL y multi-JOIN conservan sus
  cláusulas y no reciben CTEs artificiales;
- una CTE/subquery solo se permite cuando el escenario la declara como parte de
  su forma necesaria (`sql-native-cte-subquery`).

El helper ignora literales y comentarios al contar `SELECT`, CTE, subqueries,
`CASE` y casts, evitando falsos positivos por texto de usuario. Un `WITH OFFSET`
de BigQuery no se cuenta como CTE; una cabeza `nombre AS (` sí.

## Ejecución

El gate integrado está en
`apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`.
Ejecuta los fixtures del corpus, conserva diagnósticos de rechazos explícitos,
evalúa las reglas SQL del catálogo y falla si aparece cualquier violación. El
catálogo actual contiene cero certificados: los fixtures compilables siguen
siendo evidencia estructural, no certificación semántica Qlik vs BigQuery.
