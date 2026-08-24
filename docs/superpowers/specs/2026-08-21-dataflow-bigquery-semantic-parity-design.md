# Dataflow → BigQuery Semantic Parity Design

**Status:** diseño para implementación por fases  
**Fecha:** 2026-08-21  
**Research:** `docs/research/2026-08-21-qlik-dataflow-bigquery-coverage.md`

## Objetivo

Construir un compilador Qlik Dataflow/Qlik Script → GoogleSQL que preserve semántica observable, nunca descarte operaciones silenciosamente y emita el SQL más simple y legible que sea seguro. La envoltura `EXPORT DATA` queda fuera del núcleo relacional.

## Principios no negociables

1. Correctitud antes que “SQL bonito”.
2. Una operación no soportada produce un diagnóstico explícito; jamás un resultado aproximado silencioso.
3. Un `SQL SELECT` ejecutado por una conexión BigQuery se conserva como GoogleSQL nativo lossless.
4. Las expresiones de `LOAD` usan semántica Qlik y se compilan por un camino distinto del SQL nativo.
5. CTEs, temp tables, scripting y UDFs son herramientas válidas cuando una sola SELECT no preserva semántica.
6. “Supported” exige pruebas semánticas, no solo parseo.
7. La salida canónica evita capas artificiales cuando pueden fusionarse con seguridad.
## Arquitectura propuesta

El pipeline se divide en unidades con contratos independientes:

```text
Qlik Script
  → Lexer lossless
  → AST de sentencias Qlik
  → Expansión de variables / entorno semántico
  → Analizador de tablas y nombres
  → IR relacional + efectos
  → Lowering a capacidades BigQuery
  → Optimizador de fusiones y barreras
  → Emisor GoogleSQL
  → Formatter canónico
  → EXPORT DATA (capa externa)
```

El AST no es la IR. El AST conserva cómo fue escrito el script y sus posiciones; la IR expresa qué significa. Esta separación permite diagnosticar con precisión y optimizar sin reparsear texto.

## 1. Lexer lossless

Debe reconocer comentarios `//` y block comments si aparecen, strings, identificadores `[campo]`, backticks, quoted identifiers, dollar-sign expansion, variables, números, operadores, etiquetas de tabla, keywords y terminadores. Cada token lleva `offset`, línea y columna.

El lexer no decide semántica y no debe eliminar comentarios/tokens antes de que el parser haya delimitado correctamente las sentencias. Un punto y coma dentro de string o SQL anidado no puede cerrar una sentencia Qlik por accidente.
## 2. AST Qlik y frontera GoogleSQL

Tipos conceptuales mínimos:

```ts
interface SourceSpan { start: number; end: number; line: number; column: number }
interface QlikProgram { statements: QlikStatement[] }
interface NativeSqlSource {
  dialect: "bigquery";
  text: string;
  span: SourceSpan;
}
```

`NativeSqlSource.text` contiene la consulta completa entregada al driver BigQuery: CTEs, joins, hints, subqueries, `HAVING`, `QUALIFY`, ventanas, set operations y cualquier sintaxis válida. La corrección del compilador no depende de tener un parser GoogleSQL completo.

Si no hace falta modificar el SQL nativo, el emisor puede reutilizarlo directamente. Si una transformación Qlik debe aplicarse encima, se usa como subquery/CTE lossless. Un optimizador opcional puede aplanarlo únicamente cuando exista una prueba estructural de equivalencia.

Esto resuelve la regresión actual: `FROM A INNER JOIN B ... WHERE ... GROUP BY ALL` nunca se descompone parcialmente ni pierde cláusulas.

## 3. Entorno semántico Qlik

El compilador mantiene un entorno versionado con variables `SET`/`LET`, formatos de fecha/número, reglas NULL, mappings, tablas lógicas, nombres qualified/unqualified, orden conocido y modo de reload. Dollar expansion se resuelve antes del análisis que dependa de su resultado, conservando trazabilidad al texto original.
## 4. IR semántica

La IR debe representar relaciones y efectos sin depender de cómo los escribió Qlik:

```ts
type RelationOp =
  | NativeSql | Project | Filter | Aggregate | Sort
  | Join | Union | Pivot | Unpivot | Window
  | MappingLookup | IntervalMatch | HierarchyExpand
  | Concatenate | Distinct | Sample | GenerateRows;

type ScriptEffect =
  | DefineVariable | RenameTable | RenameField | DropTable
  | QualifyFields | RegisterMapping | StoreOutput
  | ConnectionMetadata | MetadataOnly | UnsupportedExternalEffect;
```

Cada nodo declara esquema de entrada/salida, cardinalidad conocida, orden conocido, determinismo y `SourceSpan`. `Join` guarda pares izquierda/derecha explícitos; no se reduce a “campos comunes” después de resolver la semántica Qlik.

Las tablas Qlik son símbolos del programa, no CTEs obligatorios. La auto-concatenación y `NoConcatenate` se resuelven aquí. `Keep` produce dos relaciones filtradas y no se rebaja a JOIN destructivo.

## 5. Compilador de expresiones

Se reemplaza el whitelist de 19 nombres por un registro declarativo generado desde la matriz de cobertura. Cada función define firma, política de tipos, estrategia BigQuery y vectores de conformidad.

Estrategias permitidas: función GoogleSQL nativa, reescritura SQL, combinación de expresiones, window, lookup relacional, UDF SQL, UDF JavaScript/UDAF, compile-time, entorno externo o rechazo explícito.

El registro no implica soporte automático: una entrada permanece `tracked` hasta que sus vectores tengan resultados de referencia y pruebas green.
## 6. Lowering BigQuery

El lowering selecciona la representación mínima que preserva semántica:

- `single_query`: filtros, proyecciones, agregaciones, joins, set ops, pivot/unpivot, ventanas.
- `recursive_cte`: jerarquías y recorridos padre-hijo cuando la semántica encaje.
- `multi_statement`: control-flow o secuencias con estado entre relaciones.
- `temp_table`: barreras de materialización, múltiples consumidores con semántica de estado o transformaciones que no pueden expresarse como composición pura.
- `sql_udf` / `js_udf` / `udaf`: funciones sin equivalente nativo exacto.
- `compile_time`: variables y branches evaluables sin datos.
- `metadata_noop`: TRACE/tags/comentarios que no alteran la salida de datos, pero quedan en auditoría.
- `external_side_effect` / `no_equivalent`: requiere un servicio externo o se rechaza.

La elección queda registrada en la auditoría para explicar por qué una ejecución produjo una sola query, un script o una UDF.

## 7. Optimizador y SQL profesional

El optimizador trabaja sobre IR y usa reglas de fusión con precondiciones explícitas. Por ejemplo, `NativeSql → Filter → Project → Aggregate` puede fusionarse si el SQL nativo es una relación segura para envolver y no existe una barrera de alias/orden/window/reutilización.

No se crean CTEs por cada nodo. Se crean cuando hay una razón semántica o de legibilidad: rama, reutilización, recursión, window después de aggregate, alias que no puede reutilizarse en la misma SELECT, o una operación stateful.

Los nombres finales provienen de nombres lógicos cuando existan. Los identificadores internos numéricos quedan reservados a debug. El formatter mantiene indentación estable, alias legibles, cláusulas por bloques y literales tipados.
## 8. Diagnósticos

Todo error de compilación incluye código estable, constructo, mensaje, `SourceSpan`, snippet corto y estrategia sugerida. Categorías mínimas: `LEXER`, `SYNTAX`, `NAME_RESOLUTION`, `TYPE_SEMANTICS`, `UNSUPPORTED_SEMANTICS`, `EXTERNAL_DEPENDENCY`, `NON_DETERMINISTIC_ORDER` y `BIGQUERY_LOWERING`.

El compilador debe validar consumo total de cada sentencia. Si quedan tokens semánticos fuera del AST, falla con `SYNTAX_UNCONSUMED_TOKENS`. Esta guarda habría detectado el `INNER JOIN` perdido por el parser actual.

## 9. Corpus y conformidad

Hay tres capas de pruebas:

1. **Inventory coverage:** todo elemento oficial descubierto debe existir en `coverage-manifest.json` con estrategia explícita.
2. **Compiler fixtures:** scripts pequeños por familia prueban parseo, IR y SQL golden; combinaciones críticas prueban interacciones.
3. **Semantic conformance:** datasets mínimos ejecutados en Qlik y BigQuery comparan resultado tipado, cardinalidad, NULL/empty y orden cuando sea observable. Estas pruebas son opt-in y nunca usan tablas productivas.

Las funciones necesitan al menos `normal`, `null`, `empty`, `boundary` y `type_coercion`; funciones de fecha agregan timezone/leap/DST, regex agrega Unicode/no-match, estadísticas agrega sample/population y dominios inválidos, stateful agrega orden/ties/partition.

No existe un conjunto finito que pruebe “todas las combinaciones posibles”; por eso el criterio exhaustivo combina inventario completo, particiones semánticas, pairwise de interacciones y regresiones reales.

## 10. Compatibilidad y migración

El compilador vNext convivirá temporalmente con el actual detrás de una selección interna. Primero se ejecutará en modo `shadow`: compila y audita sin lanzar Talend. Solo cuando un fixture/conformance family esté certificado se habilita para esa superficie.

Una ejecución jamás cae silenciosamente al compilador viejo si vNext detectó una semántica no soportada. El fallback solo se permite para scripts previamente certificados por ambos compiladores con el mismo resultado.
