#!/usr/bin/env python3
"""Genera el contrato de cobertura del compilador desde el inventario oficial."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INV = ROOT / "docs/research/qlik-language-inventory.json"
OUT = ROOT / "apps/api/src/modulos/reportes/fixtures/compiler-corpus/coverage-manifest.json"

PROCESSOR_STRATEGY = {
    "Filter": ("single_query", "WHERE/CASE; semántica NULL explícita"),
    "Select fields": ("single_query", "SELECT, alias, DISTINCT y orden de columnas"),
    "Join": ("single_query", "INNER/LEFT/RIGHT/FULL JOIN con pares de claves"),
    "Union": ("single_query", "UNION ALL/DISTINCT con alineación de esquema"),
    "Fork": ("query_plan", "Una relación lógica consumida por varias ramas"),
    "Aggregate": ("single_query", "GROUP BY + agregados nativos/UDAF"),
    "Sort": ("single_query", "ORDER BY donde el orden sea observable"),
    "Remove fields": ("single_query", "SELECT * EXCEPT o proyección explícita"),
    "Strings": ("native_or_udf", "Funciones string/regex + adaptadores Qlik"),
    "Dates": ("native_or_udf", "DATE/DATETIME/TIMESTAMP + reglas Qlik"),
    "Numbers": ("native_or_udf", "Numéricas, cast y formato"),
    "Math": ("single_query", "Funciones matemáticas GoogleSQL"),
}
PROCESSOR_STRATEGY.update({
    "Concatenate fields": ("single_query", "CONCAT/COALESCE con reglas NULL de Qlik"),
    "Split fields": ("single_query", "SPLIT/REGEXP_EXTRACT con ordinales"),
    "Cleanse": ("single_query", "CASE/COALESCE/NULLIF condicionado"),
    "Hash": ("sql_or_js_udf", "SHA nativo; FNV-256 requiere UDF exacta"),
    "Calculate fields": ("expression_compiler", "AST de expresiones Qlik"),
    "Unpivot": ("single_query", "UNPIVOT o UNION ALL generado"),
    "Pivot": ("single_query_or_dynamic", "PIVOT estático; SQL dinámico si columnas dinámicas"),
    "Window": ("single_query", "Funciones analíticas con frame/orden explícitos"),
    "Qlik script": ("full_compiler", "Puede requerir GoogleSQL multi-statement"),
    "Table recipe": ("generated_script_contract", "Compilar script generado + goldens de receta"),
    "Sample": ("single_query", "LIMIT/RAND/ranking; TABLESAMPLE no es fila-exacto"),
})

STATEMENT_DEFAULT = {
    "control": "multi_statement_or_compile_time",
    "prefix": "query_plan",
    "regular": "query_plan_or_side_effect",
}
SPECIAL_STATEMENTS = {
    "Set": "compile_time", "Let": "compile_time", "Trace": "metadata_noop",
    "Rem": "metadata_noop", "Sleep": "no_equivalent", "Execute": "external_side_effect",
    "Connect": "connection_metadata", "Disconnect": "connection_metadata",
    "Directory": "connection_metadata", "SQL": "source_sql_passthrough",
    "Select": "source_sql_passthrough", "Store": "target_side_effect",
    "Drop table": "query_plan", "Drop": "query_plan", "Rename": "query_plan",
}
SPECIAL_STATEMENTS.update({
    "Qualify": "name_resolution", "Unqualify": "name_resolution",
    "NullAsNull": "semantic_environment", "NullAsValue": "semantic_environment",
    "Map": "query_plan", "Unmap": "query_plan", "AutoNumber": "stateful_expression",
    "Binary": "external_source", "Section": "security_metadata",
    "FlushLog": "metadata_noop", "Tag": "metadata_noop", "Untag": "metadata_noop",
    "Comment field": "metadata_noop", "Comment table": "metadata_noop",
    "Alias": "name_resolution", "Declare": "semantic_environment",
    "Derive": "derived_fields", "Force": "type_semantics",
    "Loosen Table": "association_model_only", "SQLColumns": "metadata_query",
    "SQLTables": "metadata_query", "SQLTypes": "metadata_query",
})

FUNCTION_CATEGORY_STRATEGY = {
    "File functions": "external_or_compile_time",
    "System functions": "environment_or_compile_time",
    "Mapping functions": "lookup_relation",
    "Inter-record functions": "window_or_stateful",
    "Counter functions": "window_or_stateful",
    "Table functions": "schema_or_relation_metadata",
    "Window functions": "window",
    "Geospatial functions": "native_or_udf",
    "Statistical distribution functions": "native_or_udf",
}


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "item"


def operator_slug(value: str) -> str:
    names = {
        "+": "plus", "-": "minus", "*": "multiply", "/": "divide", "&": "concat",
        "=": "eq", "<>": "neq", "<": "lt", ">": "gt", "<=": "lte", ">=": "gte",
        "<<": "shift-left", ">>": "shift-right",
    }
    return names.get(value.casefold(), slug(value))


def function_strategy(name: str, category: str) -> str:
    key = name.casefold()
    if key in {"hash128", "hash160", "hash256"}:
        return "qlik_hash_udf"
    if "regex" in key:
        return "regex_engine_compatibility_or_udf"
    if key == "evaluate":
        return "compile_time_expression_evaluator"
    if key == "subfield":
        return "scalar_or_row_expansion"
    if key == "jsonget":
        return "json_pointer_lowering"
    if key in {"jsonarray", "jsonobject"}:
        return "json_builder_lowering"
    if key in {"jsonset", "jsonsetex"}:
        return "json_pointer_mutation_lowering"
    if key == "isjson":
        return "native_json_validation"
    if key in {"date", "time", "timestamp", "num", "money", "month", "monthstart"}:
        return "dual_value_lowering"
    if key in {"applymap", "mapsubstring"}:
        return "lookup_relation_or_udf"
    if key in {"peek", "previous", "lookup", "exists"}:
        return "stateful_or_window"
    if key.startswith("autonumber") or key in {"recno", "rowno", "iterno"}:
        return "stateful_expression"
    if key in {"filelist", "dirlist"}:
        return "external_enumeration"
    if key in {"connectstring", "osuser", "getuserattr", "getsysattr", "engineversion", "ispartialreload", "reloadtime"}:
        return "environment_semantics"
    return FUNCTION_CATEGORY_STRATEGY.get(category, "native_or_udf")


def main() -> None:
    inv = json.loads(INV.read_text(encoding="utf-8"))
    entries: list[dict] = []
    for processor in inv["dataflow_processors"]:
        strategy, note = PROCESSOR_STRATEGY[processor["name"]]
        entries.append({"id": "processor:" + slug(processor["name"]), "surface": "dataflow_processor", "name": processor["name"], "docs": processor["url"], "strategy": strategy, "semantic_status": "specified", "fixture_group": "processors", "note": note})
    for statement in inv["script_statements"]:
        strategy = SPECIAL_STATEMENTS.get(statement["name"], STATEMENT_DEFAULT[statement["family"]])
        entries.append({"id": f"statement:{statement['family']}:{slug(statement['name'])}", "surface": "qlik_statement", "family": statement["family"], "name": statement["name"], "docs": statement["url"], "strategy": strategy, "semantic_status": "tracked", "fixture_group": "script-structure", "note": "Nunca ignorar silenciosamente."})
    for operator in inv["operators"]:
        entries.append({"id": f"operator:{operator['family']}:{operator_slug(operator['operator'])}", "surface": "qlik_operator", "family": operator["family"], "name": operator["operator"], "docs": inv["source_roots"]["operators"], "strategy": "single_expression", "semantic_status": "tracked", "fixture_group": "expressions", "note": "Probar NULL, booleano -1/0 y coerción dual."})
    for function in inv["script_functions"]:
        if not function["script_capable"]:
            continue
        category = function["category"]
        entries.append({
            "id": f"function:{slug(function['name'])}:{slug(category)}",
            "surface": "qlik_function", "family": category, "name": function["name"],
            "kind": function["kind"], "docs": function["url"],
            "strategy": function_strategy(function["name"], category),
            "semantic_status": "tracked", "fixture_group": "functions",
            "required_vectors": ["normal", "null", "empty", "boundary", "type_coercion"],
            "note": "No marcar soportada sin vectores de conformidad Qlik vs BigQuery.",
        })
    payload = {
        "schema_version": 1, "generated_at": "2026-08-21",
        "source_inventory": "docs/research/qlik-language-inventory.json",
        "policy": {"no_silent_drop": True, "support_requires_semantic_vectors": True, "native_sql_select_is_source_dialect_passthrough": True, "qlik_load_expressions_use_qlik_semantics": True},
        "counts": {surface: sum(e["surface"] == surface for e in entries) for surface in ["dataflow_processor", "qlik_statement", "qlik_operator", "qlik_function"]},
        "entries": entries,
    }
    payload["counts"]["total"] = len(entries)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["counts"], indent=2))


if __name__ == "__main__":
    main()
