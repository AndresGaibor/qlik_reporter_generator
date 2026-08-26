#!/usr/bin/env python3
"""Genera corpus estructural y vectores pendientes para el compilador vNext."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "apps/api/src/modulos/reportes/fixtures/compiler-corpus"
INV = json.loads((ROOT / "docs/research/qlik-language-inventory.json").read_text(encoding="utf-8"))
SCENARIOS: list[dict] = []


def add(case_id: str, family: str, target: str, script: str, *, processors: list[str] | None = None, features: list[str] | None = None, source: str = "synthetic") -> None:
    filename = f"{case_id}.qlik"
    (CORPUS / "qlik").mkdir(parents=True, exist_ok=True)
    (CORPUS / "qlik" / filename).write_text(script.strip() + "\n", encoding="utf-8")
    SCENARIOS.append({
        "id": case_id, "family": family, "target": target,
        "fixture": f"qlik/{filename}", "processors": processors or [],
        "features": features or [], "source": source,
        "status": "future_acceptance",
    })

BQ = "LIB CONNECT TO [Google BigQuery:Prod];"
# Native GoogleSQL must remain lossless. These are source-dialect fixtures.
for join_type in ["INNER", "LEFT", "RIGHT", "FULL"]:
    add(
        f"sql-native-{join_type.lower()}-join", "native-sql", "single_query",
        f"""{BQ}\n[Salida]: LOAD *;\nSQL SELECT a.id, a.valor, b.nombre FROM `p.d.a` AS a {join_type} JOIN `p.d.b` AS b ON a.id = b.id;""",
        processors=["Join", "Select fields"], features=["native_sql", f"{join_type.lower()}_join"],
    )

add("sql-native-multi-join", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT a.id, b.nombre, c.zona
FROM `p.d.a` a
LEFT JOIN `p.d.b` b ON a.id = b.id
INNER JOIN `p.d.c` c ON a.zona_id = c.id AND c.activo = TRUE;""", processors=["Join"], features=["native_sql", "multi_join", "composite_on"])

add("sql-native-where-group-all", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT categoria, EXTRACT(YEAR FROM fecha) AS anio, SUM(monto) AS total
FROM `p.d.ventas`
WHERE fecha >= DATE '2026-01-01'
GROUP BY ALL;""", processors=["Filter", "Aggregate"], features=["where", "group_by_all"])

add("sql-native-having", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT categoria, SUM(monto) AS total FROM `p.d.ventas`
GROUP BY categoria HAVING SUM(monto) > 100;""", processors=["Aggregate", "Filter"], features=["having"])

add("sql-native-qualify-window", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT cliente, fecha, monto, ROW_NUMBER() OVER(PARTITION BY cliente ORDER BY fecha DESC) AS rn
FROM `p.d.ventas` QUALIFY rn = 1;""", processors=["Window", "Sort", "Filter"], features=["window", "qualify"])
add("sql-native-cte-subquery", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL WITH base AS (SELECT id, monto FROM `p.d.ventas` WHERE monto > 0)
SELECT id, monto FROM base WHERE id IN (SELECT id FROM `p.d.clientes_activos`);""", features=["cte", "subquery"])

add("sql-native-union", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT id, 'A' AS origen FROM `p.d.a`
UNION ALL
SELECT id, 'B' AS origen FROM `p.d.b`;""", processors=["Union"], features=["union_all"])

add("sql-native-distinct-order-limit", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT DISTINCT cliente FROM `p.d.ventas` ORDER BY cliente LIMIT 100;""", processors=["Select fields", "Sort", "Sample"], features=["distinct", "order_by", "limit"])

add("sql-native-pivot", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT * FROM (SELECT producto, trimestre, venta FROM `p.d.ventas`)
PIVOT(SUM(venta) FOR trimestre IN ('Q1','Q2','Q3','Q4'));""", processors=["Pivot"], features=["pivot"])

add("sql-native-unpivot", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT * FROM `p.d.ventas_wide`
UNPIVOT INCLUDE NULLS (venta FOR trimestre IN (q1, q2, q3, q4));""", processors=["Unpivot"], features=["unpivot", "include_nulls"])

add("sql-native-comments-semicolons", "native-sql", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT 'a;b' AS texto, id /* JOIN must not be parsed from this comment */
FROM `p.d.a` -- semicolon inside SQL string must survive
WHERE id > 0;""", features=["comments", "quoted_semicolon"])
# Qlik LOAD / resident / joins and table-shaping semantics.
add("qlik-filter-project", "qlik-relational", "single_query", f"""{BQ}
[Salida]: LOAD id, Upper(categoria) AS Categoria, monto WHERE monto > 0;
SQL SELECT id, categoria, monto FROM `p.d.ventas`;""", processors=["Filter", "Select fields", "Strings", "Calculate fields"], features=["preceding_load", "where"])

add("qlik-resident-chain", "qlik-relational", "single_query", f"""{BQ}
[Base]: LOAD *; SQL SELECT id, categoria, monto FROM `p.d.ventas`;
[Filtrada]: NoConcatenate LOAD id, categoria, monto RESIDENT [Base] WHERE monto > 0;
[Salida]: NoConcatenate LOAD categoria, Sum(monto) AS Total RESIDENT [Filtrada] GROUP BY categoria;
DROP TABLE [Base]; DROP TABLE [Filtrada];""", processors=["Filter", "Aggregate"], features=["resident", "drop_table", "group_by"])

for prefix in ["INNER", "LEFT", "RIGHT", "FULL"]:
    add(f"qlik-{prefix.lower()}-join", "qlik-join", "single_query", f"""{BQ}
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
{prefix} JOIN ([A]) LOAD id, nombre; SQL SELECT id, nombre FROM `p.d.b`;
[Salida]: NoConcatenate LOAD * RESIDENT [A];""", processors=["Join"], features=["qlik_join", prefix.lower()])

for prefix in ["INNER", "LEFT", "RIGHT"]:
    add(f"qlik-{prefix.lower()}-keep", "qlik-keep", "multi_relation", f"""{BQ}
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
[B]: LOAD id, nombre; SQL SELECT id, nombre FROM `p.d.b`;
{prefix} KEEP ([A]) LOAD * RESIDENT [B];""", features=["keep", prefix.lower()])

add("qlik-concatenate", "qlik-concatenate", "single_query", f"""{BQ}
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
CONCATENATE ([A]) LOAD id, valor; SQL SELECT id, valor FROM `p.d.b`;""", processors=["Union"], features=["concatenate"])

add("qlik-noconcatenate", "qlik-concatenate", "multi_relation", f"""{BQ}
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
[B]: NoConcatenate LOAD id, valor RESIDENT [A];""", features=["noconcatenate", "auto_concatenate_barrier"])
add("qlik-mapping-applymap", "qlik-mapping", "single_query", f"""{BQ}
[Mapa]: MAPPING LOAD codigo, descripcion; SQL SELECT codigo, descripcion FROM `p.d.catalogo`;
[Salida]: LOAD id, ApplyMap('Mapa', codigo, 'DESCONOCIDO') AS descripcion;
SQL SELECT id, codigo FROM `p.d.hechos`;""", features=["mapping", "applymap"])

add("qlik-crosstable", "qlik-shape", "single_query", f"""{BQ}
CROSSTABLE (Mes, Venta, 1)
[Salida]: LOAD producto, ene, feb, mar;
SQL SELECT producto, ene, feb, mar FROM `p.d.ventas_wide`;""", processors=["Unpivot"], features=["crosstable"])

add("qlik-intervalmatch", "qlik-interval", "single_query", f"""{BQ}
[Eventos]: LOAD evento, instante; SQL SELECT evento, instante FROM `p.d.eventos`;
[Intervalos]: LOAD inicio, fin, categoria; SQL SELECT inicio, fin, categoria FROM `p.d.intervalos`;
INTERVALMATCH (instante) LOAD inicio, fin RESIDENT [Intervalos];""", features=["intervalmatch"])

add("qlik-generic-load", "qlik-shape", "multi_relation", f"""{BQ}
Generic LOAD entidad, atributo, valor;
SQL SELECT entidad, atributo, valor FROM `p.d.eav`;""", features=["generic"])

add("qlik-hierarchy", "qlik-hierarchy", "recursive_cte", f"""{BQ}
Hierarchy(id, parent_id, nombre, ParentName, nombre, Path, '/', Depth)
[Salida]: LOAD id, parent_id, nombre;
SQL SELECT id, parent_id, nombre FROM `p.d.organizacion`;""", features=["hierarchy"])

add("qlik-hierarchy-belongs-to", "qlik-hierarchy", "recursive_cte", f"""{BQ}
HierarchyBelongsTo(id, parent_id, nombre, AncestorId, AncestorName, Depth, AncestorName)
[Salida]: LOAD id, parent_id, nombre;
SQL SELECT id, parent_id, nombre FROM `p.d.organizacion`;""", features=["hierarchy_belongs_to"])

add("qlik-qualify-unqualify", "qlik-names", "single_query", f"""{BQ}
QUALIFY *; UNQUALIFY id;
[A]: LOAD id, nombre; SQL SELECT id, nombre FROM `p.d.a`;
[B]: LOAD id, nombre; SQL SELECT id, nombre FROM `p.d.b`;""", features=["qualify", "unqualify"])
add("qlik-null-environment", "qlik-null", "single_query", f"""NullAsValue *; SET NullValue='<NULL>';
{BQ}
[Salida]: LOAD id, texto, If(IsNull(texto), 'N', texto) AS normalizado;
SQL SELECT id, texto FROM `p.d.a`;""", processors=["Cleanse"], features=["nullasvalue", "isnull", "empty_vs_null"])

add("qlik-set-let-expansion", "qlik-variables", "compile_time", f"""SET vInicio='2026-01-01'; LET vAnio=Year(Today());
{BQ}
[Salida]: LOAD *;
SQL SELECT * FROM `p.d.ventas` WHERE fecha >= DATE '$(vInicio)';""", processors=["Qlik script"], features=["set", "let", "dollar_expansion"])

add("qlik-exists", "qlik-stateful", "single_query", f"""{BQ}
[Permitidos]: LOAD DISTINCT id; SQL SELECT id FROM `p.d.permitidos`;
[Salida]: LOAD id, monto WHERE Exists(id); SQL SELECT id, monto FROM `p.d.ventas`;""", features=["exists"])

add("qlik-peek-previous", "qlik-stateful", "window_or_stateful", f"""{BQ}
[Salida]: LOAD id, fecha, monto, Previous(monto) AS monto_previo, Peek('monto', -1) AS peek_previo;
SQL SELECT id, fecha, monto FROM `p.d.ventas` ORDER BY id, fecha;""", processors=["Window"], features=["previous", "peek", "order_dependency"])

add("qlik-row-counters", "qlik-stateful", "window_or_stateful", f"""{BQ}
[Salida]: LOAD id, RowNo() AS row_no, RecNo() AS rec_no, IterNo() AS iter_no WHILE IterNo() <= 2;
SQL SELECT id FROM `p.d.a` ORDER BY id;""", features=["rowno", "recno", "iterno", "while_load"])

add("qlik-autonumber", "qlik-stateful", "stateful_expression", f"""{BQ}
[Salida]: LOAD AutoNumber(cliente & '|' & producto) AS surrogate_key, cliente, producto;
SQL SELECT cliente, producto FROM `p.d.ventas`;""", processors=["Concatenate fields"], features=["autonumber", "string_concat"])

add("qlik-drop-rename", "qlik-symbols", "multi_statement", f"""{BQ}
[A]: LOAD id, valor; SQL SELECT id, valor FROM `p.d.a`;
RENAME FIELD valor TO monto; RENAME TABLE A TO Hechos; DROP FIELD id FROM Hechos;""", processors=["Remove fields"], features=["rename_field", "rename_table", "drop_field"])
add("qlik-string-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD
  id,
  Upper(Trim(texto)) AS upper_texto,
  Left(texto, 3) AS prefijo,
  Mid(texto, 2, 4) AS medio,
  Len(texto) AS longitud,
  Index(texto, 'ab', 2) AS segunda_pos,
  FindOneOf(texto, 'xyz', 1) AS primer_char,
  Capitalize(texto) AS capitalizado,
  LevenshteinDist(texto, texto2) AS distancia,
  IsJson(json_text) AS es_json,
  TextBetween(texto, '<', '>', 1) AS entre,
  SubStringCount(texto, 'ab') AS repeticiones;
SQL SELECT id, texto, texto2, json_text FROM `p.d.a`;""", processors=["Strings"], features=["upper", "trim", "left", "mid", "len", "index", "findoneof", "capitalize", "levenshtein", "isjson", "textbetween", "substringcount"])

add("qlik-date-suite", "expressions", "single_query", f"""SET DateFormat='YYYY-MM-DD';
SET TimeFormat='hh:mm:ss';
SET MonthNames='Jan;Feb;Mar;Apr;May;Jun;Jul;Aug;Sep;Oct;Nov;Dec';
SET DayNames='Mon;Tue;Wed;Thu;Fri;Sat;Sun';
SET FirstWeekDay=0;
SET BrokenWeeks=0;
SET ReferenceDay=4;
{BQ}
[Salida]: LOAD
  id,
  Date(fecha) AS fecha_fmt,
  Year(fecha) AS anio,
  Month(fecha) AS mes,
  MonthStart(fecha) AS mes_inicio,
  MonthEnd(fecha) AS mes_fin,
  QuarterStart(fecha, 0, 3) AS trimestre_fiscal_inicio,
  QuarterEnd(fecha, 0, 3) AS trimestre_fiscal_fin,
  YearStart(fecha, 0, 4) AS anio_fiscal_inicio,
  YearEnd(fecha, 0, 4) AS anio_fiscal_fin,
  Week(fecha) AS semana,
  WeekYear(fecha) AS anio_semana,
  WeekDay(fecha) AS dia_semana,
  MakeDate(2024, 2, 29) AS bisiesto,
  MakeTime(12, 30, 15) AS hora,
  AddYears(fecha, 1) AS proximo_anio,
  AddMonths(fecha, 1) AS proximo_mes;
SQL SELECT id, fecha FROM `p.d.a`;""", processors=["Dates"], features=["date", "year", "month", "monthstart", "monthend", "quarterstart", "quarterend", "yearstart", "yearend", "week", "weekyear", "weekday", "makedate", "maketime", "addyears", "addmonths"])

add("qlik-json-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD
  id,
  JsonGet(json_text, '/customer/email') AS email,
  JsonGet(json_text, '/items/0') AS primer_item,
  JsonSet(json_text, '/items/price', '123') AS actualizado;
SQL SELECT id, json_text FROM `p.d.json_data`;""", processors=["Calculate fields"], features=["jsonget", "json_pointer", "jsonset"])

add("qlik-number-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD id, Num(monto, '#,##0.00') AS monto_fmt, Round(monto, 0.01) AS redondeado, Floor(monto) AS piso, Ceil(monto) AS techo;
SQL SELECT id, monto FROM `p.d.a`;""", processors=["Numbers", "Math"], features=["num", "round", "floor", "ceil"])

add("qlik-aggregate-range-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD categoria, Count(*) AS filas, Count(DISTINCT id) AS ids, Sum(DISTINCT monto) AS monto_distinto, NullCount(valor) AS nulos, NumericCount(valor) AS numericos, TextCount(valor) AS textos, MissingCount(valor) AS faltantes, RangeSum(a,b,c) AS suma_rango, RangeAvg(a,b,c) AS promedio_rango GROUP BY categoria;
SQL SELECT categoria, id, monto, valor, a, b, c FROM `p.d.metricas`;""", processors=["Aggregate", "Math"], features=["count", "distinct", "counter_aggregations", "range_sum", "range_avg"])

add("qlik-math-trig-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD id, Exp(x) AS exp_x, Log(x) AS log_x, Log10(x) AS log10_x, Pow(x, y) AS potencia, Sqr(x) AS cuadrado, Sqrt(x) AS raiz, Sin(x) AS seno, Cos(x) AS coseno, Atan2(y, x) AS angulo, e() AS e_const, pi() AS pi_const;
SQL SELECT id, x, y FROM `p.d.metricas`;""", processors=["Math", "Calculate fields"], features=["exp", "log", "pow", "sqrt", "trigonometry", "constants"])

add("qlik-split-suite", "expressions", "single_query", f"""{BQ}
[Salida]: LOAD id, SubField(texto, '|', 1) AS parte1, SubField(texto, '|', 2) AS parte2;
SQL SELECT id, texto FROM `p.d.a`;""", processors=["Split fields"], features=["subfield"])

add("qlik-hash-suite", "expressions", "single_query_or_udf", f"""{BQ}
[Salida]: LOAD id, Hash128(id, texto) AS h128, Hash256(id, texto) AS h256;
SQL SELECT id, texto FROM `p.d.a`;""", processors=["Hash"], features=["hash128", "hash256"])

add("qlik-fork-branches", "qlik-dag", "query_plan", f"""{BQ}
[Base]: LOAD id, tipo, monto; SQL SELECT id, tipo, monto FROM `p.d.ventas`;
[A]: NoConcatenate LOAD * RESIDENT [Base] WHERE tipo='A';
[B]: NoConcatenate LOAD * RESIDENT [Base] WHERE tipo='B';""", processors=["Fork"], features=["multiple_consumers", "resident"])

add("qlik-table-recipe-generated-script", "table-recipe", "generated_script_contract", f"""{BQ}
[Salida]: LOAD id, Upper(Trim(texto)) AS texto_limpio, Round(monto, 2) AS monto_fmt;
SQL SELECT id, texto, monto FROM `p.d.a`;""", processors=["Table recipe", "Strings", "Numbers"], features=["golden_capture_required"], source="synthetic-representative")
# Control flow and side-effect families. These are intentionally separate from pure relational SQL.
add("qlik-if-control", "control-flow", "compile_time_or_multi_statement", """SET vModo='A';
IF '$(vModo)'='A' THEN
  [Salida]: LOAD * INLINE [id,valor\n1,A];
ELSE
  [Salida]: LOAD * INLINE [id,valor\n2,B];
END IF;""", processors=["Qlik script"], features=["if_then_else", "inline"])

add("qlik-switch-control", "control-flow", "compile_time_or_multi_statement", """SET vModo='A';
SWITCH '$(vModo)'
CASE 'A'
  [Salida]: LOAD * INLINE [id\n1];
CASE 'B'
  [Salida]: LOAD * INLINE [id\n2];
DEFAULT
  [Salida]: LOAD * INLINE [id\n0];
END SWITCH;""", features=["switch_case"])

add("qlik-for-control", "control-flow", "compile_time_or_multi_statement", """FOR vI = 1 TO 3
  [Salida]: LOAD $(vI) AS id AUTOGENERATE 1;
NEXT vI;""", features=["for_next", "autogenerate"])

add("qlik-do-loop-control", "control-flow", "multi_statement", """LET vI=0;
DO WHILE $(vI) < 3
  LET vI=$(vI)+1;
LOOP;""", features=["do_loop", "let"])

add("qlik-sub-call", "control-flow", "compile_time_or_multi_statement", """SUB Cargar(vTabla)
  [$(vTabla)]: LOAD * INLINE [id\n1];
END SUB
CALL Cargar('Salida');""", features=["sub", "call"])

add("qlik-first-sample", "qlik-sampling", "single_query", f"""{BQ}
FIRST 10 [Salida]: LOAD *; SQL SELECT id, monto FROM `p.d.ventas` ORDER BY id;""", processors=["Sample"], features=["first_prefix"])

add("qlik-store-side-effect", "side-effect", "target_side_effect", f"""{BQ}
[Salida]: LOAD *; SQL SELECT id, monto FROM `p.d.ventas`;
STORE [Salida] INTO [lib://out/salida.qvd] (qvd);""", features=["store"])

add("qlik-filelist-external", "external-environment", "external_enumeration", """FOR EACH vFile IN FileList('lib://data/*.csv')
  [Salida]: LOAD * FROM [$(vFile)] (txt, utf8, embedded labels, delimiter is ',');
NEXT vFile;""", features=["filelist", "for_each", "external_files"])

add("qlik-partial-reload", "incremental-state", "stateful_reload", f"""{BQ}
ADD [Salida]: LOAD id, monto; SQL SELECT id, monto FROM `p.d.delta`;""", features=["partial_reload", "add_prefix"])
add("regression-ventas-mensuales-join", "regression", "single_query", f"""{BQ}
[Salida]: LOAD *;
SQL SELECT
  'Ventas' AS Tipo,
  '14.Ventas' AS `Transacción`,
  EXTRACT(YEAR FROM Fecha) AS `Año`,
  F.NOM_MES AS Mes,
  Bodega,
  `Sub bodega` AS `Sub_bodega`,
  `División`,
  `Código de departamento` AS `Código_de_departamento`,
  Departamento,
  `Sub Clasificación` AS `Sub_Clasificación`,
  `Origen Compra` AS `Origen_Compra`,
  Proveedor,
  `Gerencia Comercial` AS `Gerencia_Comercial`,
  Comprador,
  `Zona Smx Unidad Operativa` AS Zona,
  Formato,
  `Cod Ref` AS `Cod_Ref`,
  SUM(Cantidad) AS Cantidad,
  SUM(`Costo Neto`) AS `Costo de Venta`,
  SUM(`Venta Neta USD`) AS `Neto Venta`
FROM `EDWH_REP.VENTAS_MENSUALES_A`
INNER JOIN `EDWH.DIM_FECHA` AS F ON Fecha = NOM_FEC
WHERE DATE_TRUNC(Fecha, MONTH) = DATE '2026-07-01'
GROUP BY ALL;""", processors=["Join", "Filter", "Aggregate", "Select fields"], features=["user_regression", "native_sql", "inner_join", "group_by_all"], source="user-regression")

add("semantics-null-empty-dual-bool", "semantics", "single_query_or_udf", f"""{BQ}
[Salida]: LOAD id,
  texto & null() AS concat_null,
  If(flag, -1, 0) AS qlik_bool,
  Num(numero, '#,##0.00') AS numero_dual,
  If(Len(texto)=0, 'EMPTY', If(IsNull(texto), 'NULL', 'VALUE')) AS estado_texto;
SQL SELECT id, texto, flag, numero FROM `p.d.tipos`;""", processors=["Concatenate fields", "Cleanse", "Numbers"], features=["null", "empty", "dual", "boolean_minus_one"])

add("qlik-calculate-complex-expression", "expressions", "single_query_or_udf", f"""{BQ}
[Salida]: LOAD id,
  If(IsNull(monto), 0, Round(monto * 1.12, 2)) AS total,
  Upper(Trim(categoria)) & '-' & Year(fecha) AS clave;
SQL SELECT id, monto, categoria, fecha FROM `p.d.ventas`;""", processors=["Calculate fields", "Strings", "Math", "Dates", "Concatenate fields"], features=["nested_functions", "coercion", "concat"])
def main() -> None:
    CORPUS.mkdir(parents=True, exist_ok=True)
    (CORPUS / "scenarios.json").write_text(json.dumps({"schema_version": 1, "generated_at": "2026-08-21", "scenarios": SCENARIOS}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    vectors = []
    for function in INV["script_functions"]:
        if not function["script_capable"]:
            continue
        required = ["normal", "null", "empty", "boundary", "type_coercion"]
        name = function["name"].casefold()
        category = function["category"].casefold()
        if "date" in category or any(x in name for x in ["date", "time", "month", "year", "week", "day"]):
            required += ["timezone", "leap_boundary"]
        if "regex" in name or name in {"match", "mixmatch", "wildmatch"}:
            required += ["unicode", "no_match"]
        if any(x in category for x in ["statistical", "financial"]):
            required += ["invalid_domain", "precision"]
        if name in {"previous", "peek", "rowno", "recno", "iterno", "firstvalue", "lastvalue"}:
            required += ["ordered_input", "ties"]
        vectors.append({
            "name": function["name"], "category": function["category"],
            "docs": function["url"], "vectors": sorted(set(required)),
            "reference_status": "needs_reference_outcome",
            "notes": "Expected Qlik outputs must be captured or derived from official semantics before support is certified.",
        })
    (CORPUS / "function-vectors.json").write_text(json.dumps({"schema_version": 1, "generated_at": "2026-08-21", "functions": vectors}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"scenarios": len(SCENARIOS), "function_vector_entries": len(vectors)}, indent=2))


if __name__ == "__main__":
    main()
