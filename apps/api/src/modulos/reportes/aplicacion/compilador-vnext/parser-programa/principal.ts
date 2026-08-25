import type { QlikProgram } from "../ast.js";
import { escanearSentenciasQlik } from "../scanner-qlik.js";
import { parsearBloque } from "./control.js";
import { codigo, failParser } from "./utilidades.js";

export function parsearProgramaQlik(script: string): QlikProgram {
  const rawStatements = escanearSentenciasQlik(script);
  const parsed = parsearBloque(rawStatements, 0);
  if (parsed.nextIndex !== rawStatements.length) {
    const statement = rawStatements[parsed.nextIndex];
    if (statement) {
      failParser(
        "SYNTAX_UNEXPECTED_CONTROL_CLAUSE",
        `Cláusula de control inesperada: ${codigo(statement)}`,
        statement,
      );
    }
  }
  return { statements: parsed.statements };
}
