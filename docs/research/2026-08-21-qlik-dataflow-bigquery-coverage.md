# Investigación de paridad Qlik Dataflow → BigQuery

Fecha de corte: 2026-08-21.

## Objetivo

Definir una superficie verificable para compilar el Qlik Script generado por Dataflow a GoogleSQL sin perder semántica y produciendo SQL canónico y legible. El objetivo no es que el compilador “acepte” scripts: una operación solo se considera soportada cuando existe evidencia de equivalencia semántica.

## Fuentes oficiales

- Qlik Cloud Data Flow processors: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/DataFlow/List-of-data-flow-processors.htm
- Qlik Script processor: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/DataFlow/data-flow-processor-script.htm
- Qlik script functions: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Scripting/functions-in-scripts-chart-expressions.htm
- Qlik script statements/keywords: https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Scripting/script-statements-keywords.htm
- GoogleSQL query syntax: https://cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax
- GoogleSQL procedural language: https://cloud.google.com/bigquery/docs/reference/standard-sql/procedural-language
- BigQuery UDFs: https://cloud.google.com/bigquery/docs/user-defined-functions

## Inventario reproducible

`scripts/research/generar-inventario-qlik.py` rastrea el árbol oficial actual de Qlik Help. El snapshot está en `docs/research/qlik-language-inventory.json` y la matriz contractual en `apps/api/src/modulos/reportes/fixtures/compiler-corpus/coverage-manifest.json`.

El snapshot limpio actual contiene 23 procesadores visuales, 80 sentencias/prefijos/control-flow, 24 operadores y 395 entradas de funciones utilizables en script. Diez de esas entradas son variantes `...RegExI` case-insensitive que Qlik documenta dentro de las páginas de las funciones regex base, aunque no les asigne enlaces propios en el índice. `NoOfRows` aparece legítimamente en dos categorías. El contrato total contiene 522 elementos. La lista se regenera; estos números no deben hardcodearse como verdad eterna.
## Hallazgos que cambian la arquitectura

1. Dataflow permite previsualizar el Qlik Script equivalente de cada etapa y el script completo. Ese script generado es el contrato de entrada más estable que hoy tiene este proyecto.
2. El procesador **Qlik script** declara que permite aprovechar “the whole Qlik syntax”. Por tanto, cubrir solo los 23 procesadores visuales no equivale a cubrir Dataflow.
3. Un `SQL SELECT` dentro de Qlik Script no usa semántica de expresiones Qlik: lo interpreta el driver ODBC. Para una conexión BigQuery, debe parsearse/preservarse como GoogleSQL, no pasar por el traductor de expresiones Qlik.
4. Qlik Table Recipe embebido en Dataflow aporta 60+ funciones no-code y desde julio de 2026 incluye columnas calculadas y formato numérico. El contrato práctico debe validarse capturando el Qlik Script que genera, no intentando reimplementar la UI de Recipe.
5. BigQuery tiene SELECT/CTE/recursive CTE, JOIN, PIVOT/UNPIVOT, ventanas, multi-statement scripting, variables, IF/loops, temp tables y UDF SQL/JavaScript. Eso permite representar mucho más Qlik de lo que soporta el compilador actual.

## Definición de “100%”

“100%” no puede significar “una única SELECT para cualquier script”. Significa:

- 100% del inventario oficial está **rastreado**.
- Todo constructo observado se compila correctamente o falla de forma explícita con código, ubicación y razón.
- Nunca se omite silenciosamente un JOIN, WHERE, tabla, función, variable o efecto.
- Cada elemento marcado `supported` tiene vectores de conformidad para valores normales, NULL, vacío, límites y coerción de tipos cuando aplique.
- La salida se clasifica como `single_query`, `multi_statement`, `recursive_cte`, `temp_table`, `sql_udf`, `js_udf`, `compile_time`, `metadata_noop`, `external_side_effect` o `no_equivalent`.
- La equivalencia se juzga por resultados y efectos observables, no por parecido textual.
## Matriz de los 23 procesadores Dataflow

| Procesador | Estrategia BigQuery | Riesgo semántico principal |
|---|---|---|
| Filter | WHERE / CASE por rama | NULL pertenece a no-match; All/Any/None |
| Select fields | SELECT + aliases + DISTINCT | orden/nombre exacto de columnas |
| Join | INNER/LEFT/RIGHT/FULL JOIN | pares de claves y colisiones de nombres |
| Union | UNION ALL / DISTINCT | columnas ausentes → NULL y orden de esquema |
| Fork | DAG con relación compartida | dos salidas no deben mutarse entre sí |
| Aggregate | GROUP BY + agregados | First/Last/strings/percentile/stdev |
| Sort | ORDER BY | orden solo es observable en ciertos pasos |
| Remove fields | SELECT * EXCEPT / proyección | wildcard y columnas calculadas |
| Strings | funciones nativas/regex/UDF | índices 1-based, Unicode, regex y NULL |
| Dates | DATE/DATETIME/TIMESTAMP | timezone, formato, dual values, truncado |
| Numbers | numéricas/casts/formato | separadores, redondeo y parsing local |
| Math | funciones matemáticas | dominio, NaN/INF/NULL |
| Concatenate fields | CONCAT/COALESCE | en Qlik `A & NULL` conserva A |
| Split fields | SPLIT/regex | ordinal, faltantes, regex y límites |
| Cleanse | CASE/COALESCE/NULLIF | diferencia entre empty y NULL |
| Hash | SHA nativo o UDF | FNV-256 no coincide con SHA/FARM_FINGERPRINT |
| Calculate fields | compilador de expresiones | semántica Qlik, no GoogleSQL crudo |
| Unpivot | UNPIVOT / UNION ALL | INCLUDE/EXCLUDE NULLS y nombres |
| Pivot | PIVOT / SQL dinámico | valores dinámicos y agregación `Only` |
| Window | OVER(PARTITION/ORDER/frame) | frame exacto, First/Last, concatenación |
| Qlik script | compilador completo | puede requerir scripting/temp/UDF |
| Table recipe | script generado + goldens | catálogo evoluciona y supera 60 funciones UI |
| Sample | LIMIT/RAND/ranking | aleatoriedad exacta; TABLESAMPLE es por bloques |
## Superficie de Qlik Script

El inventario se divide en tres familias de sentencias oficiales y funciones. El compilador debe modelar la semántica antes de decidir el SQL de salida.

### Control de flujo

`Call`, `Do..loop`, `Exit`, `Exit script`, `For..next`, `For each..next`, `If..then..elseif..else`, `Sub..end sub`, `Switch..case..default` y sus keywords auxiliares. Si las condiciones dependen solo de constantes/variables de compilación, se pueden evaluar en compile-time; si dependen de datos/queries, el destino es GoogleSQL procedural (`IF`, `LOOP`, `WHILE`, `FOR...IN`) o un rechazo explícito cuando la equivalencia no exista.

### Prefijos estructurales

Se rastrean `Add`, `Concatenate`, `Crosstable`, `First`, `Generic`, `Hierarchy`, `HierarchyBelongsTo`, `Inner`, `IntervalMatch`, `Join`, `Keep`, `Left`, `Mapping`, `Merge`, `NoConcatenate`, `Outer`, `Partial reload`, `Replace`, `Right`, `Sample`, `Semantic`, `Unless` y `When`.

Los más delicados son `Keep` (reduce tablas pero conserva ambas), `Generic` (EAV puede producir varias tablas), `Hierarchy*` (expansión recursiva), `IntervalMatch` (point-in-interval con claves), `Mapping` y la semántica de partial reload. No deben forzarse artificialmente a una sola SELECT.

### Sentencias regulares

El snapshot rastrea `Alias`, `AutoNumber`, `Binary`, comentarios, conexiones, `Declare/Derive`, `Drop`, `Force`, `LOAD`, `LET`, `Map`, tratamiento de NULL, `Qualify/Unqualify`, `Rename`, `Section`, `SELECT`, `SET`, `SQL`, metadata SQL, `Store`, tags y otras sentencias. Efectos que no forman parte del dataset final se clasifican como metadata, conexión, side-effect o no-equivalent; se documentan, nunca se borran silenciosamente.

### Funciones

El inventario limpio actual encuentra 395 entradas script-capable en categorías de agregación, condicionales, contadores, fecha/hora, financieras, formato, numéricas, geoespaciales, interpretación, inter-record, mapping, NULL, range, estadísticas, string, sistema, tabla y ventanas. Diez son variantes regex `...I` case-insensitive documentadas dentro de sus páginas base. `coverage-manifest.json` exige una estrategia para cada una; regex Perl, JSON Pointer, hashes Qlik, row-expansion, duales, estado y dependencias externas se clasifican explícitamente y no se esconden bajo un mapping genérico.
## Capacidades BigQuery que debe aprovechar el emisor

- Query: CTEs, CTE recursivas, subqueries, todos los JOIN principales, set operations, `GROUP BY ALL`, `HAVING`, `QUALIFY`, `PIVOT`, `UNPIVOT`, ventanas y `SELECT * EXCEPT/REPLACE`.
- Scripting: `DECLARE`, `SET`, `IF/ELSEIF/ELSE`, `CASE`, `LOOP`, `WHILE`, `REPEAT`, `FOR...IN`, `BREAK`, `CONTINUE`, `EXECUTE IMMEDIATE` y bloques `BEGIN/END`.
- Estado relacional: tablas temporales, DDL/DML y multi-statement queries cuando una transformación Qlik realmente crea/modifica relaciones intermedias.
- Extensibilidad: UDF SQL para adaptadores simples; UDF/UDAF JavaScript cuando la semántica no exista nativamente. Debe preferirse SQL nativo por optimización y costo.
- Recursión: `WITH RECURSIVE` es útil para jerarquías, sujeto a las restricciones de BigQuery y su límite de iteraciones.
- Sampling: `TABLESAMPLE SYSTEM` opera por bloques y no es equivalente a muestreo fila-a-fila; para semántica de fila usar `RAND()`/ranking, aceptando que la reproducibilidad requiere una clave/semilla definida.

## Diferencias semánticas que requieren pruebas, no sustitución textual

1. **Booleanos:** Qlik usa 0 para falso y -1 para verdadero en expresiones. GoogleSQL tiene `BOOL`. Una traducción puede necesitar convertir explícitamente cuando el resultado se materializa como número.
2. **Dual values:** muchas funciones Qlik producen una representación numérica y otra textual. BigQuery no tiene un tipo dual nativo; hay que decidir si el contexto consume valor numérico, texto o ambos.
3. **NULL:** Qlik tiene reglas particulares. Ejemplo crítico: concatenación con `&` puede conservar el operando no nulo, mientras `CONCAT`/`||` de SQL puede propagar NULL según función/operador.
4. **Empty vs NULL:** Dataflow/Table Recipe y Qlik distinguen cadenas vacías de NULL. `COALESCE` por sí solo no reproduce ambos conceptos.
5. **Coerción implícita:** Qlik convierte número↔texto con mayor libertad y depende de variables de formato (`DecimalSep`, `DateFormat`, etc.). BigQuery es más tipado.
6. **Orden de carga:** `Previous`, `Peek`, `RowNo`, `RecNo`, First/Last y ciertos Window dependen del orden lógico/físico. Sin un ORDER BY determinista no existe equivalencia fuerte.
7. **Auto-concatenate:** Qlik puede concatenar automáticamente tablas con esquemas idénticos; `NoConcatenate` lo desactiva. El IR debe representar esto.
8. **Asociación de tablas:** Qlik asocia tablas por nombres de campos y puede generar synthetic keys. Un SQL relacional no debe inventar joins solo por coincidencia salvo que la sentencia Qlik lo requiera.
9. **JOIN Qlik vs JOIN SQL:** un prefijo Qlik `JOIN (Tabla)` usa la semántica de tablas Qlik y campos comunes; un `INNER JOIN ... ON ...` dentro de `SQL SELECT` pertenece al dialecto BigQuery y debe preservarse literalmente en su AST SQL.
10. **Mapping:** `ApplyMap` incluye valor por defecto y no equivale siempre a un `INNER JOIN`; normalmente requiere `LEFT JOIN`/subquery + `COALESCE` cuidadosamente tipado.
11. **IntervalMatch:** es un join punto-en-intervalo, con límites y hasta múltiples claves. Requiere política explícita para intervalos solapados y NULL.
12. **Hierarchy:** la expansión padre-hijo suele mapear a CTE recursiva, pero hay que probar ciclos, raíces, profundidad y orden de caminos.
13. **Qualify/Unqualify:** alteran resolución/nombres de campos, no datos. Deben ejecutarse en la capa de nombres antes de emitir SQL.
14. **File/System functions:** `FileName`, `FilePath`, `ConnectString`, `OSUser`, `ReloadTime`, `filelist()` y similares dependen del entorno Qlik. Solo pueden compilarse si se define una fuente de metadata equivalente; de lo contrario deben fallar explícitamente.
15. **Partial reload/Merge/Add/Replace:** describen cómo Qlik actualiza estado existente. Una consulta de exportación sin estado previo no puede fingir equivalencia; se requiere modelo incremental o rechazo explícito.

## SQL canónico esperado

El emisor no debe reflejar mecánicamente cada nodo del IR como un CTE. Debe aplicar reglas de fusión seguras:

- `source → filter → projection → aggregate → sort` puede ser una sola SELECT cuando ninguna etapa es reutilizada ni cambia la cardinalidad de manera que obligue a materialización lógica.
- Crear CTE cuando mejora legibilidad o cuando existe una rama, reutilización, ventana sobre agregado, dependencia de alias, recursión o barrera semántica.
- Usar nombres derivados de la intención (`ventas_filtradas`, `dim_fecha`) cuando exista metadata; evitar `fuente_1/filtro_2` como salida final salvo debug interno.
- Preservar comentarios útiles de SQL fuente cuando sea seguro; no preservar comentarios que cambien tokenización o contengan código muerto ambiguo.
- Literales tipados (`DATE '2026-07-01'`) y alias consistentes con backticks para nombres que lo requieran.
- El `EXPORT DATA` es una envoltura final; no debe contaminar el compilador relacional.

## Regla de seguridad del compilador

Si el parser consume tokens no triviales que el AST no representa, la compilación debe fallar. Un parser que acepta `JOIN ... ON ...` pero lo descarta es peor que un parser que lo rechaza, porque produce resultados falsos con apariencia válida.
## Auditoría del compilador actual

El código vigente es útil como prototipo, pero no cumple todavía este contrato de paridad:

- `parser-dataflow.ts` tokeniza sentencias por `;` y usa expresiones regulares para `SQL SELECT`; no tiene lexer con source spans ni AST completo.
- El parser de SQL fuente extrae una sola tabla del primer `FROM`. Un `INNER JOIN ... ON ...` nativo puede ser consumido y descartado sin marcar incompatibilidad.
- `WHERE` nativo se convierte hoy en un paso separado, pero la tabla lógica final puede seguir apuntando a la fuente previa; existe una regresión reproducible donde el filtro no participa en el SELECT final.
- No se representan nativamente `HAVING`, `QUALIFY`, CTE, subqueries complejas, set operations ni el resto de GoogleSQL fuente.
- `compilador-bigquery.ts` materializa casi cada paso como CTE (`fuente_1`, `filtro_2`, etc.) y no tiene optimizador de fusiones/barreras.
- El whitelist manual de expresiones Qlik contiene 19 funciones frente a cientos rastreadas en el inventario oficial.
- `LET`, control-flow y la mayoría de prefijos/sentencias no tienen modelo semántico.
- No existe modelo de variables globales de formato, valores duales, coerción, orden lógico, auto-concatenate, mapping tables o estado incremental.
- Los errores no llevan posición exacta de línea/columna/token del script original.

La primera prioridad no es agregar más `if` al parser actual. Es crear una frontera lossless y una IR en la que sea imposible que un token semánticamente relevante desaparezca.
