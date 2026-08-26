import type { QlikProgram } from "../ast.js";
import type { PlanCompilacionVNext } from "../ir.js";
import { ejecutarProgramaQlik } from "./control.js";
import { EstadoAnalisisSemantico } from "./estado.js";

export function analizarProgramaQlik(
  program: QlikProgram,
): PlanCompilacionVNext {
  const estado = new EstadoAnalisisSemantico();
  ejecutarProgramaQlik(program, estado);
  return estado.toPlan();
}
