export type CategoriaDiagnosticoVNext =
  | "LEXER"
  | "SYNTAX"
  | "NAME_RESOLUTION"
  | "TYPE_SEMANTICS"
  | "UNSUPPORTED_SEMANTICS"
  | "EXTERNAL_DEPENDENCY"
  | "NON_DETERMINISTIC_ORDER"
  | "BIGQUERY_LOWERING";

export interface SourceSpan {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface DiagnosticoVNext {
  code: string;
  category: CategoriaDiagnosticoVNext;
  message: string;
  span: SourceSpan;
  snippet?: string;
}

export class ErrorCompilacionVNext extends Error {
  constructor(public readonly diagnostic: DiagnosticoVNext) {
    super(diagnostic.message);
    this.name = "ErrorCompilacionVNext";
  }
}

export interface SentenciaCruda {
  text: string;
  span: SourceSpan;
  terminatedBySemicolon: boolean;
}
