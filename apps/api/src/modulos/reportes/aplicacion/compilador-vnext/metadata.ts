import type { ExprQlik } from "./expresiones-qlik.js";
import type { PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import { ErrorCompilacionVNext } from "./modelo.js";

export interface TablaMetadataCompileTime {
  name: string;
  index: number;
  fields: readonly string[];
  rowCount?: number;
  values?: Readonly<Record<string, readonly ValorMetadataCompileTime[]>>;
  rows?: readonly Readonly<
    Record<string, ValorMetadataCompileTime | undefined>
  >[];
}

export interface ValorMetadataCompileTime {
  key: string;
  sql: string;
}

export interface CatalogoMetadataCompileTime {
  tables: readonly TablaMetadataCompileTime[];
}

export interface EntornoMetadataQlik {
  catalog?: CatalogoMetadataCompileTime;
  filePath?: string;
}

const TABLE_FUNCTIONS = new Set([
  "fieldname",
  "fieldnumber",
  "nooffields",
  "noofrows",
  "nooftables",
  "tablename",
  "tablenumber",
]);

const FILE_FUNCTIONS = new Set([
  "attribute",
  "filebasename",
  "filedir",
  "fileextension",
  "filename",
  "filepath",
  "filesize",
  "filetime",
  "qvdcreatetime",
  "qvdfieldname",
  "qvdnooffields",
  "qvdnoofrecords",
  "qvdtablename",
]);

const ENVIRONMENT_FUNCTIONS = new Set([
  "computername",
  "connectstring",
  "documentname",
  "documentpath",
  "documenttitle",
  "engineversion",
  "getcollationlocale",
  "getsysattr",
  "getuserattr",
  "ispartialreload",
  "osuser",
  "productversion",
  "reloadtime",
]);

const PATH_FUNCTIONS = new Set([
  "filebasename",
  "filedir",
  "fileextension",
  "filename",
  "filepath",
]);

export function construirCatalogoMetadata(
  plan: PlanCompilacionVNext,
): CatalogoMetadataCompileTime {
  const byId = new Map(
    plan.relations.map((relation) => [relation.id, relation]),
  );
  return {
    tables: Object.entries(plan.tables).map(([name, relationId], index) => {
      const relation = byId.get(relationId);
      const values =
        relation?.op === "inline" ? valoresInline(relation) : undefined;
      const rows =
        relation?.op === "inline" ? filasInline(relation) : undefined;
      return {
        name,
        index,
        fields: relation?.schemaKnown ? relation.fields : [],
        ...(relation ? rowCountCompileTime(relation, byId) : {}),
        ...(values ? { values } : {}),
        ...(rows ? { rows } : {}),
      };
    }),
  };
}

function valoresInline(
  relation: Extract<RelacionVNext, { op: "inline" }>,
): Readonly<Record<string, readonly ValorMetadataCompileTime[]>> {
  const rows = filasInline(relation);
  return Object.fromEntries(
    relation.columns.map((field) => {
      const distinct: ValorMetadataCompileTime[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const value = row[field];
        if (!value || seen.has(value.key)) continue;
        seen.add(value.key);
        distinct.push(value);
      }
      return [field, distinct];
    }),
  );
}

function filasInline(
  relation: Extract<RelacionVNext, { op: "inline" }>,
): Readonly<Record<string, ValorMetadataCompileTime | undefined>>[] {
  return relation.rows.map((row) =>
    Object.fromEntries(
      relation.columns.map((field, index) => {
        const raw = row[index]?.trim() ?? "";
        return [field, metadataValue(raw)];
      }),
    ),
  );
}

export function metadataValue(
  raw: string,
): ValorMetadataCompileTime | undefined {
  if (!raw || /^(?:null|NULL\(\))$/i.test(raw)) return undefined;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))
    return { key: `n:${raw}`, sql: raw };
  if (/^(?:true|false)$/i.test(raw))
    return { key: `b:${raw.toLowerCase()}`, sql: raw.toUpperCase() };
  if (raw.startsWith("'") && raw.endsWith("'")) {
    const value = raw.slice(1, -1).replaceAll("''", "'");
    return { key: `s:${value}`, sql: quoteString(value) };
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    const value = raw.slice(1, -1).replaceAll('""', '"');
    return { key: `s:${value}`, sql: quoteString(value) };
  }
  return { key: `s:${raw}`, sql: quoteString(raw) };
}

function rowCountCompileTime(
  relation: RelacionVNext,
  byId: ReadonlyMap<string, RelacionVNext>,
): { rowCount?: number } {
  if (relation.op === "inline") return { rowCount: relation.rows.length };
  if (relation.op === "autogenerate") {
    const count = Number(relation.countExpression);
    return Number.isSafeInteger(count) && count >= 0 ? { rowCount: count } : {};
  }
  if (relation.op === "project" || relation.op === "sort") {
    const input = byId.get(relation.input);
    return input ? rowCountCompileTime(input, byId) : {};
  }
  if (relation.op === "union_all") {
    const counts = relation.inputs.map((id) => {
      const input = byId.get(id);
      return input ? rowCountCompileTime(input, byId).rowCount : undefined;
    });
    if (counts.every((count): count is number => count !== undefined))
      return { rowCount: counts.reduce((total, count) => total + count, 0) };
  }
  return {};
}

export function emitirMetadataQlik(
  name: string,
  args: readonly ExprQlik[],
  environment: EntornoMetadataQlik,
): string | undefined {
  const normalized = name.toLowerCase();
  if (PATH_FUNCTIONS.has(normalized))
    return emitirPathMetadata(normalized, args, environment.filePath);
  if (normalized.startsWith("qvd"))
    failMetadata(
      "EXTERNAL_QVD_METADATA_UNAVAILABLE",
      `${name} requiere leer el encabezado o los datos de un QVD externo; no se inventa metadata`,
    );
  if (FILE_FUNCTIONS.has(normalized))
    failMetadata(
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
      `${name} depende de metadata del filesystem o del archivo que se está leyendo; no se inventa un valor compile-time`,
    );
  if (ENVIRONMENT_FUNCTIONS.has(normalized))
    failMetadata(
      "ENVIRONMENT_METADATA_UNAVAILABLE",
      `${name} depende del entorno Qlik (documento, usuario, engine o reload) y no puede probarse en BigQuery`,
    );
  if (TABLE_FUNCTIONS.has(normalized))
    return emitirTableMetadata(normalized, name, args, environment.catalog);
  return undefined;
}

function emitirPathMetadata(
  name: string,
  args: readonly ExprQlik[],
  currentPath?: string,
): string {
  if (args.length > 1)
    failMetadata(
      "FUNCTION_ARITY",
      `${name} requiere cero argumentos o una ruta literal compile-time`,
    );
  const path = args[0]?.kind === "string" ? args[0].value : currentPath;
  if (path === undefined)
    failMetadata(
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
      `${name} requiere la ruta del archivo actual; el filesystem no está disponible durante la compilación`,
    );
  if (args[0] && args[0].kind !== "string")
    failMetadata(
      "EXTERNAL_FILE_METADATA_UNAVAILABLE",
      `${name} solo puede probarse con una ruta literal compile-time`,
    );
  const parsed = analizarRuta(path);
  const value =
    name === "filebasename"
      ? parsed.baseName
      : name === "filedir"
        ? parsed.directory
        : name === "fileextension"
          ? parsed.extension
          : name === "filename"
            ? parsed.fileName
            : parsed.path;
  return quoteString(value);
}

interface RutaCompileTime {
  path: string;
  directory: string;
  fileName: string;
  baseName: string;
  extension: string;
}

export function analizarRuta(path: string): RutaCompileTime {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const fileName = path.slice(separator + 1);
  const directory = separator >= 0 ? path.slice(0, separator) : "";
  const dot = fileName.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < fileName.length - 1;
  return {
    path,
    directory,
    fileName,
    baseName: hasExtension ? fileName.slice(0, dot) : fileName,
    extension: hasExtension ? fileName.slice(dot + 1) : "",
  };
}

function emitirTableMetadata(
  name: string,
  originalName: string,
  args: readonly ExprQlik[],
  catalog?: CatalogoMetadataCompileTime,
): string {
  if (!catalog)
    failMetadata(
      "TABLE_METADATA_UNAVAILABLE",
      `${originalName} requiere el catálogo compile-time de tablas; no se puede demostrar en este contexto`,
    );
  if (name === "nooftables") {
    if (args.length !== 0)
      failMetadata("FUNCTION_ARITY", `${originalName} no admite argumentos`);
    return String(catalog.tables.length);
  }
  if (name === "tablename") {
    if (args.length !== 1)
      failMetadata("FUNCTION_ARITY", `${originalName} requiere un argumento`);
    const index = literalInteger(args[0], originalName);
    return catalog.tables[index]?.name === undefined
      ? "NULL"
      : quoteString(catalog.tables[index].name);
  }
  if (name === "tablenumber") {
    if (args.length !== 1)
      failMetadata("FUNCTION_ARITY", `${originalName} requiere un argumento`);
    const requested = literalStringArgument(args, 0, originalName);
    return String(
      catalog.tables.find((table) => table.name === requested)?.index ?? "NULL",
    );
  }
  const tableName = literalStringArgument(
    args,
    name === "fieldname" || name === "fieldnumber" ? 1 : 0,
    originalName,
  );
  const table = catalog.tables.find(
    (candidate) => candidate.name === tableName,
  );
  if (!table || table.fields.length === 0)
    failMetadata(
      "TABLE_METADATA_UNAVAILABLE",
      `${originalName} no puede demostrar el esquema de la tabla ${tableName}`,
    );
  if (name === "nooffields") {
    if (args.length !== 1)
      failMetadata("FUNCTION_ARITY", `${originalName} requiere un argumento`);
    return String(table.fields.length);
  }
  if (name === "noofrows") {
    if (args.length !== 1 || table.rowCount === undefined)
      failMetadata(
        "TABLE_METADATA_UNAVAILABLE",
        `${originalName} no puede demostrar las filas de la tabla ${tableName}`,
      );
    return String(table.rowCount);
  }
  if (name === "fieldname") {
    if (args.length !== 2)
      failMetadata("FUNCTION_ARITY", `${originalName} requiere dos argumentos`);
    const field = table.fields[literalInteger(args[0], originalName) - 1];
    return field === undefined ? "NULL" : quoteString(field);
  }
  if (name === "fieldnumber") {
    if (args.length !== 2)
      failMetadata("FUNCTION_ARITY", `${originalName} requiere dos argumentos`);
    const fieldName = literalStringArgument(args, 0, originalName);
    const index = table.fields.indexOf(fieldName);
    return String(index < 0 ? 0 : index + 1);
  }
  return failMetadata(
    "TABLE_METADATA_UNAVAILABLE",
    `${originalName} no tiene lowering compile-time seguro`,
  );
}

function literalStringArgument(
  args: readonly ExprQlik[],
  index: number,
  originalName: string,
): string {
  const argument = args[index];
  if (!argument || argument.kind !== "string")
    failMetadata(
      "TABLE_METADATA_UNAVAILABLE",
      `${originalName} requiere argumentos literales para resolver metadata compile-time`,
    );
  return argument.value;
}

function literalInteger(
  expression: ExprQlik | undefined,
  originalName: string,
): number {
  if (
    !expression ||
    expression.kind !== "number" ||
    !/^\d+$/.test(expression.raw)
  )
    failMetadata(
      "TABLE_METADATA_UNAVAILABLE",
      `${originalName} requiere un entero literal para resolver metadata compile-time`,
    );
  const value = Number(expression.raw);
  if (!Number.isSafeInteger(value))
    failMetadata(
      "TABLE_METADATA_UNAVAILABLE",
      `${originalName} requiere un entero seguro`,
    );
  return value;
}

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function failMetadata(code: string, message: string): never {
  throw new ErrorCompilacionVNext({
    code,
    category:
      code.startsWith("EXTERNAL_") || code.startsWith("ENVIRONMENT_")
        ? "EXTERNAL_DEPENDENCY"
        : code === "TABLE_METADATA_UNAVAILABLE"
          ? "NAME_RESOLUTION"
          : "BIGQUERY_LOWERING",
    message,
    span: { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 },
  });
}
