import type { ExprQlik } from "./expresiones-qlik.js";
import { ErrorCompilacionVNext } from "./modelo.js";

export interface HelpersGeoespaciales {
  emitValue(expression: ExprQlik): string;
  emitNumeric(expression: ExprQlik): string;
}

const GEOSPATIAL_FUNCTIONS = new Set([
  "geoaggrgeometry",
  "geoboundingbox",
  "geocountvertex",
  "geogetboundingbox",
  "geogetpolygoncenter",
  "geoinvprojectgeometry",
  "geomakepoint",
  "geoproject",
  "geoprojectgeometry",
  "georeducegeometry",
  "makegeoline",
  "makegeopoint",
  "makegeopolygon",
  "makegeoregion",
]);

export function esFuncionGeoespacial(name: string): boolean {
  return GEOSPATIAL_FUNCTIONS.has(name.toLowerCase());
}

export function emitirGeoespacialQlik(
  name: string,
  args: readonly ExprQlik[],
  helpers: HelpersGeoespaciales,
): string | undefined {
  const normalized = name.toLowerCase();
  if (!GEOSPATIAL_FUNCTIONS.has(normalized)) return undefined;
  if (normalized === "geomakepoint") {
    arity(name, args, 2);
    const latitudeArgument = args[0];
    const longitudeArgument = args[1];
    if (!latitudeArgument || !longitudeArgument)
      fail("FUNCTION_ARITY", `${name} requiere dos argumentos`);
    // Qlik recibe latitud/longitud; BigQuery recibe longitud/latitud.
    const longitude =
      longitudeArgument.kind === "number"
        ? longitudeArgument.raw
        : helpers.emitNumeric(longitudeArgument);
    const latitude =
      latitudeArgument.kind === "number"
        ? latitudeArgument.raw
        : helpers.emitNumeric(latitudeArgument);
    return `ST_GEOGPOINT(${longitude}, ${latitude})`;
  }
  if (normalized === "geogetpolygoncenter") {
    arity(name, args, 1);
    const geometry = args[0];
    if (!geometry) fail("FUNCTION_ARITY", `${name} requiere un argumento`);
    return `ST_CENTROID(${helpers.emitValue(geometry)})`;
  }
  if (normalized === "geocountvertex") {
    arity(name, args, 1);
    const geometry = args[0];
    if (!geometry) fail("FUNCTION_ARITY", `${name} requiere un argumento`);
    return `ST_NUMPOINTS(${helpers.emitValue(geometry)})`;
  }
  fail(
    "GEOSPATIAL_SEMANTICS_UNSUPPORTED",
    `${name} requiere GeoJSON/proyección/agregación Qlik que no tiene equivalencia nativa GEOGRAPHY demostrada`,
  );
}

function arity(
  name: string,
  args: readonly ExprQlik[],
  expected: number,
): void {
  if (args.length !== expected)
    fail(
      "FUNCTION_ARITY",
      `${name} requiere ${expected} argumento${expected === 1 ? "" : "s"}`,
    );
}

function fail(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category:
      code === "GEOSPATIAL_SEMANTICS_UNSUPPORTED"
        ? "UNSUPPORTED_SEMANTICS"
        : "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}
