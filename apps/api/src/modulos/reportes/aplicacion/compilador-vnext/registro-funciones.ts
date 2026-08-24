import manifest from "../../fixtures/compiler-corpus/coverage-manifest.json";
import vectors from "../../fixtures/compiler-corpus/function-vectors.json";

export type RuntimeStatus = "implemented" | "tracked";
export type CertificationStatus = "unverified" | "certified" | "non_equivalent";

export interface FuncionQlikRegistrada {
  id: string;
  name: string;
  category: string;
  docs: string;
  strategy: string;
  signatureFamily: string;
  deterministic: boolean;
  requiredVectors: string[];
  runtimeStatus: RuntimeStatus;
  certificationStatus: CertificationStatus;
}

const IMPLEMENTED = new Set([
  "upper", "lower", "trim", "ltrim", "rtrim", "left", "right", "len",
  "replace", "subfield", "mid", "chr", "ord", "repeat", "keepchar", "purgechar",
  "index", "findoneof", "capitalize", "levenshteindist", "isjson", "jsonget", "jsonset", "textbetween",
  "substringcount", "countregex", "countregexi", "extractregex", "extractregexi",
  "indexregex", "indexregexi", "matchregex", "matchregexi",
  "replaceregex", "replaceregexi", "extractregexgroup", "extractregexgroupi",
  "indexregexgroup", "indexregexgroupi", "subfieldregex", "subfieldregexi",
  "replaceregexgroup", "replaceregexgroupi", "isregex", "isregexi",
  "round", "floor", "ceil", "fabs", "div", "mod", "fmod", "frac",
  "bitcount", "sign", "even", "odd",
  "year", "day", "hour", "minute", "second", "week", "weekyear", "quarter",
  "date", "month", "monthstart", "monthend", "quarterstart", "quarterend", "yearstart", "yearend", "daystart", "dayend", "weekday", "makedate", "maketime",
  "addyears", "addmonths", "num",
  "isnull", "null", "emptyisnull", "if", "match",
  "sum", "min", "max", "avg", "count", "only", "nullcount", "numericcount", "textcount", "missingcount",
  "rangesum", "rangeavg", "rangemin", "rangemax", "rangecount", "rangenullcount",
  "rangenumericcount", "rangetextcount", "rangemissingcount",
  "exp", "log", "log10", "pow", "sqr", "sqrt",
  "acos", "acosh", "asin", "asinh", "atan", "atan2", "atanh",
  "cos", "cosh", "sin", "sinh", "tan", "tanh",
  "e", "pi", "rand",
]);

const NON_DETERMINISTIC = new Set([
  "now", "today", "localtime", "gmt", "utc", "rand", "reloadtime",
]);

const vectorsByKey = new Map(
  vectors.functions.map((entry) => [
    `${entry.name.toLowerCase()}::${entry.category}`,
    entry.vectors,
  ]),
);

function signatureFamily(category: string): string {
  const value = category.toLowerCase();
  if (value.includes("aggregation")) return "aggregation";
  if (value.includes("date") || value.includes("time")) return "temporal";
  if (value.includes("string")) return "string";
  if (value.includes("numeric") || value.includes("math")) return "numeric";
  if (value.includes("null") || value.includes("conditional")) return "logical";
  if (value.includes("file")) return "external_file";
  if (value.includes("system")) return "environment";
  if (value.includes("mapping")) return "mapping";
  if (value.includes("inter-record") || value.includes("counter")) return "stateful";
  return "specialized";
}

const official = manifest.entries.filter(
  (entry) => entry.surface === "qlik_function",
);

export const REGISTRO_FUNCIONES_QLIK: FuncionQlikRegistrada[] = official.map(
  (entry) => {
    const key = `${entry.name.toLowerCase()}::${entry.family ?? ""}`;
    const runtimeStatus: RuntimeStatus = IMPLEMENTED.has(entry.name.toLowerCase())
      ? "implemented"
      : "tracked";
    return {
      id: entry.id,
      name: entry.name,
      category: entry.family ?? "unknown",
      docs: entry.docs,
      strategy: entry.strategy,
      signatureFamily: signatureFamily(entry.family ?? "unknown"),
      deterministic: !NON_DETERMINISTIC.has(entry.name.toLowerCase()),
      requiredVectors: vectorsByKey.get(key) ?? [
        "normal", "null", "empty", "boundary", "type_coercion",
      ],
      runtimeStatus,
      certificationStatus: "unverified",
    };
  },
);

const byName = new Map<string, FuncionQlikRegistrada[]>();
for (const entry of REGISTRO_FUNCIONES_QLIK) {
  const key = entry.name.toLowerCase();
  byName.set(key, [...(byName.get(key) ?? []), entry]);
}

export function obtenerFuncionesQlik(name: string): FuncionQlikRegistrada[] {
  return byName.get(name.toLowerCase()) ?? [];
}

export function obtenerFuncionQlik(name: string): FuncionQlikRegistrada | undefined {
  return obtenerFuncionesQlik(name)[0];
}
