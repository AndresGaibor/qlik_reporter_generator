import type { BindingMapSubstringQlik } from "../mapping-mapsubstring.js";
import type { CatalogoMetadataCompileTime } from "../metadata.js";

export type ExprQlik =
  | { kind: "number"; raw: string }
  | { kind: "string"; value: string }
  | { kind: "identifier"; name: string }
  | { kind: "variable"; name: string }
  | { kind: "wildcard" }
  | { kind: "call"; name: string; args: ExprQlik[]; modifiers?: string[] }
  | { kind: "unary"; operator: string; operand: ExprQlik }
  | { kind: "binary"; operator: string; left: ExprQlik; right: ExprQlik };

export type ContextoExpresion =
  | "value"
  | "numeric"
  | "numeric_component"
  | "text"
  | "condition";

export interface ComponentesDualQlik {
  numericField: string;
  textField: string;
}

export interface BindingApplyMapQlik {
  callKey: string;
  alias: string;
  hitField: string;
  lookupValueField: string;
  lookupNumericField: string;
  lookupTextField: string;
  defaultExpression?: ExprQlik;
  keyExpression: ExprQlik;
}

export interface EntornoExpresionQlik {
  dateFormat?: string;
  timeFormat?: string;
  timestampFormat?: string;
  monthNames?: readonly string[];
  dayNames?: readonly string[];
  decimalSep?: string;
  thousandSep?: string;
  firstWeekDay?: number;
  brokenWeeks?: number;
  referenceDay?: number;
  firstMonthOfYear?: number;
  identifierQualifier?: string;
  dualComponents?: Readonly<Record<string, ComponentesDualQlik>>;
  aggregationOrderBy?: readonly string[];
  applyMapBindings?: ReadonlyMap<string, BindingApplyMapQlik>;
  mapSubstringBindings?: ReadonlyMap<string, BindingMapSubstringQlik>;
  tableMetadata?: CatalogoMetadataCompileTime;
  fieldTypes?: Readonly<Record<string, string>>;
  filePath?: string;
}
