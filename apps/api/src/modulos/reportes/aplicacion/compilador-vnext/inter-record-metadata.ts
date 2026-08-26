import type { ExprQlik } from "./expresiones-qlik.js";
import type {
  CatalogoMetadataCompileTime,
  ValorMetadataCompileTime,
} from "./metadata.js";
import { ErrorCompilacionVNext } from "./modelo.js";

const INTER_RECORD_METADATA_FUNCTIONS = new Set([
  "fieldindex",
  "fieldvalue",
  "fieldvaluecount",
  "lookup",
]);

export function emitirInterRecordMetadata(
  name: string,
  args: readonly ExprQlik[],
  catalog?: CatalogoMetadataCompileTime,
): string | undefined {
  const normalized = name.toLowerCase();
  if (!INTER_RECORD_METADATA_FUNCTIONS.has(normalized)) return undefined;
  if (!catalog)
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} requiere símbolos y orden de carga compile-time; el alcance chart/runtime no está disponible`,
    );
  if (normalized === "lookup") return emitirLookup(name, args, catalog);
  const field = literalString(args[0], name);
  const values = valoresCampo(catalog, field);
  if (!values)
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} no puede demostrar los valores cargados del campo ${field}`,
    );
  if (normalized === "fieldvaluecount") {
    if (args.length !== 1)
      fail("FUNCTION_ARITY", `${name} requiere un argumento`);
    return String(values.length);
  }
  if (args.length !== 2)
    fail("FUNCTION_ARITY", `${name} requiere dos argumentos`);
  if (normalized === "fieldvalue") {
    const index = literalIndex(args[1], name);
    return values[index - 1]?.sql ?? "NULL";
  }
  const key = literalValueKey(args[1], name);
  const index = values.findIndex((value) => value.key === key);
  return String(index < 0 ? 0 : index + 1);
}

function emitirLookup(
  name: string,
  args: readonly ExprQlik[],
  catalog: CatalogoMetadataCompileTime,
): string {
  if (args.length < 3 || args.length > 4)
    fail("FUNCTION_ARITY", `${name} requiere tres o cuatro argumentos`);
  if (!args[3])
    fail(
      "INTER_RECORD_SCOPE_UNSUPPORTED",
      "LookUp sin tabla explícita depende de la tabla/chart actual y no puede probarse aquí",
    );
  const returnField = literalString(args[0], name);
  const matchField = literalString(args[1], name);
  const matchValue = literalValueKey(args[2], name);
  const tableName = literalString(args[3], name);
  const table = catalog.tables.find(
    (candidate) => candidate.name === tableName,
  );
  if (!table?.rows)
    fail(
      "INTER_RECORD_ORDER_UNPROVEN",
      `LookUp requiere una tabla INLINE con orden de carga demostrable: ${tableName}`,
    );
  if (!table.fields.includes(returnField) || !table.fields.includes(matchField))
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `LookUp no encuentra los campos ${returnField}/${matchField} en ${tableName}`,
    );
  const row = table.rows.find(
    (candidate) => candidate[matchField]?.key === matchValue,
  );
  return row?.[returnField]?.sql ?? "NULL";
}

function valoresCampo(
  catalog: CatalogoMetadataCompileTime,
  field: string,
): readonly ValorMetadataCompileTime[] | undefined {
  const values: ValorMetadataCompileTime[] = [];
  const seen = new Set<string>();
  let found = false;
  for (const table of catalog.tables) {
    const tableValues = table.values?.[field];
    if (!tableValues) continue;
    found = true;
    for (const value of tableValues) {
      if (seen.has(value.key)) continue;
      seen.add(value.key);
      values.push(value);
    }
  }
  return found ? values : undefined;
}

function literalString(expression: ExprQlik | undefined, name: string): string {
  if (!expression || expression.kind !== "string")
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} requiere nombres de campo/tabla como literales`,
    );
  return expression.value;
}

function literalIndex(expression: ExprQlik | undefined, name: string): number {
  const raw =
    expression?.kind === "number"
      ? expression.raw
      : expression?.kind === "string"
        ? expression.value
        : undefined;
  if (!raw || !/^\d+$/.test(raw))
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} requiere un índice entero literal`,
    );
  const index = Number(raw);
  if (!Number.isSafeInteger(index) || index < 1)
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} requiere un índice positivo seguro`,
    );
  return index;
}

function literalValueKey(
  expression: ExprQlik | undefined,
  name: string,
): string {
  if (!expression)
    fail(
      "INTER_RECORD_METADATA_UNAVAILABLE",
      `${name} requiere un valor literal`,
    );
  if (expression.kind === "string") return `s:${expression.value}`;
  if (expression.kind === "number") return `n:${expression.raw}`;
  if (
    expression.kind === "identifier" &&
    /^(true|false)$/i.test(expression.name)
  )
    return `b:${expression.name.toLowerCase()}`;
  fail(
    "INTER_RECORD_METADATA_UNAVAILABLE",
    `${name} solo puede probar valores literales en esta fase`,
  );
}

function fail(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category:
      code === "INTER_RECORD_SCOPE_UNSUPPORTED" ||
      code === "INTER_RECORD_ORDER_UNPROVEN"
        ? "NON_DETERMINISTIC_ORDER"
        : code === "INTER_RECORD_METADATA_UNAVAILABLE"
          ? "EXTERNAL_DEPENDENCY"
          : "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}
