# Compiler vNext SQL Cleanliness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que todo Qlik/Dataflow soportado por compiler-vnext produzca GoogleSQL semánticamente equivalente, compacto, legible y sin capas redundantes, con gates que impidan regresiones.

**Architecture:** Mantener `parser -> semantic analyzer -> IR -> optimizer -> BigQuery emitter`, moviendo simplificaciones semánticas al optimizador IR y dejando al emisor responsable solo de representar el IR limpiamente. El emisor podrá aplanar únicamente estructuras cuya equivalencia sea demostrable. Conformance medirá complejidad estructural, no solo fragmentos de texto.

**Tech Stack:** Bun, TypeScript, bun:test, GoogleSQL/BigQuery dry-run, compiler-vnext IR/conformance corpus.

**Specs:** `docs/superpowers/specs/2026-08-21-dataflow-bigquery-semantic-parity-design.md` y `docs/superpowers/specs/2026-08-25-schema-aware-bigquery-compiler-design.md`.

## Global Constraints

- No modificar el compilador legacy ni reintroducir fallback al legacy.
- No ejecutar consultas BigQuery con costo; solo metadata y `bq query --dry_run`.
- No cambiar semántica Qlik para producir SQL más corto.
- No reescribir `Count` como `Sum`, ni alterar agregados pedidos por el Dataflow.
- No perder `dual`, `mapping`, `stateful`, `orderBy`, `distinct`, `generic`, `unpivot` ni campos internos.
- No resetear, descartar ni sobrescribir cambios no relacionados presentes en `main`.
- Cada regla nueva debe entrar mediante TDD: RED, implementación mínima, GREEN, corpus completo.
- Las optimizaciones deben ser genéricas; queda prohibido detectar nombres `BQ_Inventario`, tablas o campos del fixture para activar reglas.
- Todo cambio de SQL debe conservar los dry-runs válidos existentes y el contrato de errores explícitos/no-silent-drop.

---### Task 1: Congelar baseline y métricas de limpieza

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates/calidad-sql.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates/tipos.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`

**Produces:** métricas `selects`, `ctes`, `subqueries`, `identity_projections`, `select_star_wrappers`, `max_subquery_depth`, `physical_source_occurrences` y `redundant_aliases`.

- [ ] Añadir tests RED para detectar `SELECT * FROM (SELECT ...)`, `SELECT * FROM cte`, `x AS x`, profundidad de subquery y repetición de una fuente física.
- [ ] Ejecutar `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts` y confirmar fallos por métricas inexistentes.
- [ ] Implementar scanner estructural conservador en `calidad-sql.ts`; debe ignorar strings/comentarios y no intentar parsear GoogleSQL completo.
- [ ] Extender `SqlQualityExpectation` con máximos opcionales para las métricas nuevas y códigos de violación específicos.
- [ ] En la regresión BQ_Inventario, exigir que `FAC_INVENTARIO_SMAX`, `DIM_UNIDAD_OP_SMAX`, `DIM_ARTICULO`, `ARTICULO_PROVEEDOR` y `DIM_PROVEEDOR_SMAX` aparezcan una sola vez.
- [ ] No fijar todavía un máximo agresivo de líneas; usar estructura, no longitud textual.
- [ ] Ejecutar tests focales y después `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext`.
- [ ] Commit sugerido: `test(compiler): gate redundant sql structure`.

### Task 2: Modularizar el optimizer sin cambiar comportamiento

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/grafo.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/proyecciones.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/principal.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
**Interfaces:** `optimizarPlanRelacionalVNext(plan: PlanCompilacionVNext): PlanCompilacionVNext` debe permanecer compatible.

- [ ] Escribir tests de caracterización para identidad, project→aggregate y project final→aggregate existentes.
- [ ] Mover `redirigirReferencia`, conteo de consumidores y recorrido de dependencias a `grafo.ts` sin alterar resultados.
- [ ] Mover reglas actuales de project a `proyecciones.ts`.
- [ ] Hacer que `principal.ts` ejecute reglas hasta punto fijo con límite explícito y orden determinista.
- [ ] Mantener `optimizador-ir.ts` como re-export para no romper imports existentes.
- [ ] Ejecutar suite completa; el SQL de todos los fixtures debe ser byte-a-byte igual al baseline de Task 1 salvo formatting ya normalizado.
- [ ] Commit sugerido: `refactor(compiler): modularize relational optimizer`.

### Task 3: Column liveness / dead-column elimination

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/columnas.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/principal.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts`

**Produces:** `calcularCamposRequeridos(plan): ReadonlyMap<string, ReadonlySet<string>>` y `podarColumnasMuertas(plan, required): PlanCompilacionVNext`.

- [ ] Test RED: una fuente de 50 campos seguida de project/filter/project que termina usando 3 campos no debe conservar los otros 47 en el IR optimizado.
- [ ] Propagar requerimientos desde `outputRelationId` hacia atrás.
- [ ] `filter`: conservar campos downstream + referencias de `condition`.
- [ ] `project`: conservar solo proyecciones downstream, pero añadir todas las referencias de expresiones conservadas y dependencias mapping/dual/internal.
- [ ] `aggregate`: nunca eliminar claves de `groupBy`; conservar referencias de groupBy y de agregados necesarios, aunque la dimensión no salga al final.
- [ ] `join`: conservar join keys en ambos lados + campos downstream de cada lado; ser conservador ante colisiones y FULL/RIGHT joins.
- [ ] `union_all`: propagar el mismo esquema requerido a todas las ramas para conservar alineación posicional/nombres.
- [ ] `sort`/`limit`: conservar campos de orden; `stateful`, `generic`, mapping y dual deben usar modo conservador si no se puede probar liveness.
- [ ] No usar regex ingenua para extraer referencias dentro de strings; reutilizar parser/scanner Qlik o crear extractor léxico que respete `[]`, quotes y llamadas.
- [ ] GREEN focal y corpus completo.
- [ ] Commit sugerido: `feat(compiler): prune dead relational columns`.
### Task 4: Fusionar proyecciones y filtros de forma semánticamente segura

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/proyecciones.ts`
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/predicados.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir/principal.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/optimizador-ir.test.ts`

- [ ] Test RED para `project(identity) -> project`, `project(rename-only) -> project` y `filter -> project` que hoy producen wrappers.
- [ ] Fusionar project→project solo si el project interno no tiene `distinct`, `orderBy`, mapping, MapSubstring, dual ni campos internos observables.
- [ ] La sustitución de aliases debe respetar tokens Qlik; nunca reemplazar texto dentro de literales o nombres parciales.
- [ ] Absorber filter a través de project solo cuando cada referencia del filtro pueda mapearse inequívocamente a una expresión determinista del project.
- [ ] No empujar filtros a través de aggregate, distinct, limit, stateful, unpivot, generic ni outer joins.
- [ ] Para `CASE WHEN P THEN 1 ELSE 0 END = 1`, simplificar a `P` únicamente cuando la forma haya sido generada por `If(P,1,0)` y no cambie NULL semantics.
- [ ] Añadir caso de regresión inspirado en `FILTRO_UOP`: la salida no debe proyectar decenas de columnas que solo eran temporales.
- [ ] Ejecutar tests focales y corpus completo.
- [ ] Commit sugerido: `feat(compiler): fuse safe projections and predicates`.

### Task 5: Referencias directas a CTE y eliminación de wrappers triviales

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/principal.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/fuentes.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/utilidades.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

**Produces:** un helper de fuente que distingue `SQL query` de `FROM source`, para no representar una CTE como `SELECT * FROM cte`.

- [ ] Test RED: un CTE compartido usado por filter/project debe generar `FROM shared_x AS src`, nunca `FROM (SELECT * FROM shared_x) AS src`.
- [ ] Mantener `emit(id)` para query completa y añadir una vía `emitSource(id, alias, includeInternal)` para FROM seguro.
- [ ] Si `id` es CTE factorizada, `emitSource` debe devolver directamente `shared_x AS alias`.
- [ ] Si es native SQL simple, reutilizar `extraerFromNativoSimple`.
- [ ] Para cualquier otra relación conservar `wrap(emit(...), alias)`; no aplanar por intuición.
- [ ] Eliminar aliases `x AS x` donde `emitFields/sameIdentifier` pueda probar identidad.
- [ ] GREEN y corpus completo.
- [ ] Commit sugerido: `feat(compiler): emit direct relational sources`.
### Task 6: Aplanar cadenas de INNER JOIN, no outer joins

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/fuentes.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/relacional.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

- [ ] Test RED con cuatro tablas físicas encadenadas por INNER JOIN: debe existir una sola cláusula FROM/JOIN continua y cero subqueries entre joins.
- [ ] Generalizar `resolverFuenteJoinDirecta` para representar una cadena de leaves con bindings `campo lógico -> alias físico.campo` y condiciones pushdown.
- [ ] Generar aliases estables por leaf (`j1`, `j2`, ...) en vez de reutilizar `l/r` recursivamente.
- [ ] Permitir rename-only projects y filters deterministas dentro de cada leaf.
- [ ] Rechazar flattening cuando exista DISTINCT, aggregate, limit, sort observable, mapping, dual, stateful, unpivot, generic o expresión calculada no trazable.
- [ ] Rechazar flattening si hay colisiones de campos no resueltas o si no puede demostrarse qué leaf posee una join key.
- [ ] No aplicar asociatividad a LEFT/RIGHT/FULL JOIN. Esos joins solo pueden perder wrappers triviales alrededor de sus inputs, nunca reordenarse ni reagruparse.
- [ ] Añadir regresión de FULL JOIN para demostrar que COALESCE de claves y cardinalidad siguen iguales.
- [ ] GREEN y corpus completo.
- [ ] Commit sugerido: `feat(compiler): flatten safe inner join chains`.

### Task 7: Formalizar planificación de CTEs compartidas y nombres legibles

**Files:**
- Create: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/plan-ctes.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery/principal.ts`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/emisor-bigquery.test.ts`

- [ ] Mover `dependenciasRelacion`, conteo de referencias, orden topológico y selección de CTE fuera de `principal.ts`.
- [ ] Test RED: un subgrafo caro compartido se factoriza una vez; uno trivial no debe crear capas más largas que duplicarlo.
- [ ] Usar `plan.tables` para obtener nombre lógico cuando exista; sanitizar a snake_case ASCII/underscore y resolver colisiones determinísticamente.
- [ ] Ejemplo esperado: preferir `seleccionar_campos_2` sobre `shared_r28`; fallback estable `shared_r28` si no existe nombre lógico.
- [ ] Permitir factorizar `aggregate`, `project`, `filter`, `sort`, `limit`, `semi_filter`, `unpivot` y, tras Task 6, `join` si no contiene campos internos/dual que requieran otra forma.
- [ ] No factorizar `generic`; no introducir materialización ni afirmar reducción de bytes procesados por usar CTE.
- [ ] Conservar orden topológico cuando una CTE compartida depende de otra.
- [ ] GREEN y corpus completo.
- [ ] Commit sugerido: `refactor(compiler): plan shared ctes explicitly`.
### Task 8: Convertir SQL quality en un gate de arquitectura

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates/calidad-sql.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates/tipos.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates/contrato.ts`
- Modify: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/conformance-catalog.json`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/conformance-gates.test.ts`

- [ ] Añadir expectativas `max_identity_projections`, `max_select_star_wrappers`, `max_subquery_depth`, `max_redundant_aliases` y `max_physical_source_occurrences` por escenario.
- [ ] No marcar como error un `SELECT *` semánticamente requerido; el detector debe señalar únicamente wrappers cuya única función sea reenvolver una relación sin cambio.
- [ ] Exigir que cada uno de los 23 `dataflow_processor` del manifest esté cubierto por al menos un escenario de calidad SQL, no solo por un fixture declarado.
- [ ] Para statements/operators/functions, exigir quality scenario solo a entradas cuyo target sea compilable a GoogleSQL; las entradas compile-time, multi-relation o intentionally-non-equivalent conservan su contrato explícito.
- [ ] Mantener rechazo explícito para superficies no soportadas; nunca convertir una mejora de limpieza en silent drop.
- [ ] Añadir reporte por escenario con métricas antes/después para que una regresión sea diagnosticable.
- [ ] GREEN y corpus completo.
- [ ] Commit sugerido: `feat(compiler): enforce sql architecture quality gates`.

### Task 9: Añadir corpus combinatorio de fronteras del optimizador

**Files:**
- Modify: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/scenarios.json`
- Create fixtures under: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/qlik/optimizer-*.qlik`
- Modify: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/conformance-catalog.json`
- Test: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/corpus-ejecutable.test.ts`

- [ ] Añadir escenarios para `filter→project`, `project→project`, `project→aggregate`, `filter→aggregate` y branch/fanout.
- [ ] Añadir `inner join chain`, `inner join + rename`, `inner join + filter`, y negativos con DISTINCT/calculated projection.
- [ ] Añadir `LEFT`, `RIGHT`, `FULL` join seguidos de project para comprobar que no se reordenan.
- [ ] Añadir `union_all + project`, `sort + limit`, `mapping/applymap`, `dual`, `stateful`, `unpivot`, `generic` rejection y CTE compartida.
- [ ] Cada fixture debe tener required/forbidden fragments y límites estructurales; no aceptar golden gigante como única prueba.
- [ ] Ejecutar corpus y corregir solamente bugs demostrados; no relajar gates para hacer pasar SQL innecesariamente complejo.
- [ ] Commit sugerido: `test(compiler): cover optimizer interaction matrix`.
### Task 10: Validar contra BQ_Inventario real, sin especializar el compilador

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/regresion-bq-inventario.test.ts`
- No commitear el script de negocio completo; usar la ejecución local únicamente como validación externa.

- [ ] Obtener en modo read-only el `script_dataflow` de la ejecución `b0ba124d-3c96-420d-b21c-ba1123536e6a` o, si ya no existe, la ejecución más reciente cuyo flujo sea `BQ_Inventario`.
- [ ] Compilar ese script con `compilarDataflowVNext` y guardar temporalmente la salida en `/tmp/bq_inventario_final.sql`.
- [ ] Medir con el mismo quality analyzer de Task 1; no mantener un segundo script de métricas basado en grep como fuente de verdad.
- [ ] Criterios bloqueantes: cada tabla física principal aparece 1 vez; `select_star_wrappers=0`; `identity_projections=0`; `redundant_aliases=0`.
- [ ] Objetivo estructural para esta regresión: `selects <= 15`, `subqueries <= 8`, `max_subquery_depth <= 5`. Si una capa excede el objetivo por semántica real, demostrarla con un fixture mínimo antes de permitir una excepción.
- [ ] Comparar contra baseline observado: 716 líneas/24.7 KB/25 SELECT/17 subqueries; líneas y bytes son métricas informativas, no el criterio semántico principal.
- [ ] Ejecutar BigQuery dry-run solamente. La salida nueva debe validar y no aumentar `totalBytesProcessed` más de 1% frente al baseline `3,504,939,187` bytes sin una explicación de semántica/schema.
- [ ] No ejecutar el query real ni EXPORT DATA.
- [ ] Commit sugerido: `test(compiler): lock bq inventario sql quality`.

### Task 11: Cerrar cobertura declarada de Qlik sin falsear soporte

**Files:**
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/cobertura-corpus.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/reporte-cobertura.ts`
- Modify as needed: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/coverage-manifest.json`
- Modify as needed: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/runtime-function-status.json`
- Modify as needed: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/function-vectors.json`
- Modify as needed: `apps/api/src/modulos/reportes/fixtures/compiler-corpus/conformance-catalog.json`

- [ ] Mantener inventario oficial actual como baseline: 23 processors, 80 statements, 24 operators, 395 functions, total 522.
- [ ] Fallar CI si una entrada del manifest no está en uno de estos estados explícitos: certified, implemented_unverified, tracked/unsupported-explicit, intentionally_non_equivalent.
- [ ] Para los 23 processors, exigir escenario ejecutable + quality contract + resultado compiled o rechazo explícito documentado; un mero nombre en `scenarios.json` no cuenta como cobertura.
- [ ] Para las 395 funciones, conservar los cinco vectores mínimos `normal`, `null`, `empty`, `boundary`, `type_coercion`; una función marcada implemented no puede quedar sin prueba ejecutable.
- [ ] Para statements/operators que requieren multi-statement, compile-time o multi-relation, certificar esa estrategia; no forzarlos artificialmente a un SELECT único.
- [ ] Si se descubre una superficie nueva en documentación/fixtures de Qlik, primero añadirla al manifest y hacer fallar el gate antes de implementar soporte.
- [ ] El objetivo es cero superficies desconocidas/silenciosamente ignoradas, no fingir que toda construcción Qlik puede expresarse como un SELECT BigQuery.
- [ ] Commit sugerido: `test(compiler): make qlik coverage exhaustive and explicit`.
### Task 12: Verificación final y reporte de antes/después

**Files:**
- Modify: `docs/research/` únicamente si ya existe un reporte de cobertura/calidad equivalente; no crear documentación duplicada.

- [ ] Ejecutar `bun test apps/api/src/modulos/reportes/aplicacion/compilador-vnext` y exigir 0 fallos.
- [ ] Ejecutar los tests focales de `optimizador-ir`, `emisor-bigquery`, `conformance-gates` y `regresion-bq-inventario` por separado para facilitar diagnóstico.
- [ ] Ejecutar Biome sobre todos los archivos modificados del compilador.
- [ ] Ejecutar `git diff --check` y exigir salida limpia.
- [ ] Ejecutar `bun run --cwd apps/api typecheck`. Si sigue apareciendo el error preexistente de `descargas/aplicacion/particionar-csv-descarga.test.ts`, documentarlo y no tocar ese módulo dentro de este trabajo.
- [ ] Recompilar BQ_Inventario real y ejecutar dry-run final en proyecto/location originales; no ejecutar consulta pagada.
- [ ] Generar tabla final con baseline vs final: bytes SQL, líneas, SELECT, CTE, subqueries, depth, wrappers, aliases redundantes, ocurrencias de fuentes y dry-run bytes.
- [ ] Confirmar explícitamente que las mejoras de CTE/formatting no se venden como ahorro de BigQuery si el dry-run no baja.
- [ ] Revisar `git diff` completo para asegurar que no hay lógica especial por nombre de reporte/tabla/campo de BQ_Inventario.
- [ ] Commit final sugerido solo para ajustes de integración: `feat(compiler): certify clean BigQuery emission`.

## Orden obligatorio de ejecución

1. Task 1 métricas/gates.
2. Task 2 modularización sin cambio semántico.
3. Task 3 column liveness.
4. Task 4 projection/predicate fusion.
5. Task 5 direct sources/CTE wrappers.
6. Task 6 inner join flattening.
7. Task 7 CTE planning/naming.
8. Task 8 quality architecture gate.
9. Task 9 interaction corpus.
10. Task 10 BQ_Inventario real.
11. Task 11 exhaustive Qlik coverage contract.
12. Task 12 verification/report.

No saltar directamente a Task 10: BQ_Inventario es el caso de validación, no el diseño del optimizador.