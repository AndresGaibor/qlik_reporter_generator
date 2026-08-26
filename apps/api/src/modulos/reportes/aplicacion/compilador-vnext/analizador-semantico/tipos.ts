import type { LoadPrefix } from "../ast.js";
import type { ComponentesDualVNext, RelacionVNext } from "../ir.js";
import type { SourceSpan } from "../modelo.js";
import type { EspecificacionLoadVNext } from "../parser-carga.js";

export type RelacionSinId = RelacionVNext extends infer R
  ? R extends { id: string }
    ? Omit<R, "id">
    : never
  : never;

export interface CargaPendiente {
  label?: string;
  prefix: LoadPrefix;
  spec: EspecificacionLoadVNext;
  span: SourceSpan;
}

export interface AnalisisProyecciones {
  dualFields: string[];
  dualComponents: Record<string, ComponentesDualVNext>;
  dualExpressions: Record<string, string>;
}

export type ControlSignal = "script" | "for" | "do" | "sub";

export type ControlScope = { inFor: boolean; inDo: boolean; inSub: boolean };

export const MAX_COMPILE_TIME_ITERATIONS = 10_000;
