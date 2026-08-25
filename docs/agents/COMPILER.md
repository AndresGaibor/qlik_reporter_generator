# Compilador Qlik → BigQuery

Punto de entrada activo: `apps/api/src/modulos/reportes/aplicacion/compilador-vnext/index.ts`.

## Pipeline

1. `parser-programa`: script → AST.
2. `analizador-semantico`: AST → plan/IR con semántica Qlik.
3. `optimizador-ir.ts`: transformaciones preservando semántica.
4. `emisor-bigquery`: plan → SQL BigQuery.

`expresiones-qlik` implementa expresiones/funciones; `registro-funciones.ts` controla cobertura; `fixtures/compiler-corpus` y conformance protegen compatibilidad.

No agregues funcionalidad nueva al compilador legacy `compilador-bigquery.ts` salvo una decisión explícita de compatibilidad.
