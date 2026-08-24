import type { SourceSpan } from "./modelo.js";

export interface NativeSqlSource {
  dialect: "bigquery";
  text: string;
  span: SourceSpan;
}

export type LoadPrefix =
  | { type: "none" }
  | { type: "noconcatenate" }
  | { type: "mapping" }
  | { type: "join"; join: "inner" | "left" | "right" | "full"; target?: string }
  | { type: "keep"; keep: "inner" | "left" | "right"; target?: string }
  | { type: "concatenate"; target?: string }
  | {
      type: "crosstable";
      attributeField: string;
      dataField: string;
      qualifierFields: number;
    }
  | { type: "generic" }
  | { type: "first"; limitExpression: string };

export type QlikStatement =
  | { type: "connect"; connection: string; span: SourceSpan; raw: string }
  | {
      type: "load";
      label?: string;
      body: string;
      wildcard: boolean;
      prefix: LoadPrefix;
      span: SourceSpan;
      raw: string;
    }
  | { type: "native_sql"; sql: NativeSqlSource; span: SourceSpan; raw: string }
  | { type: "store"; body: string; span: SourceSpan; raw: string }
  | { type: "drop"; body: string; span: SourceSpan; raw: string }
  | {
      type: "set";
      mode: "set" | "let";
      body: string;
      span: SourceSpan;
      raw: string;
    }
  | { type: "unsupported"; keyword: string; span: SourceSpan; raw: string };

export interface QlikProgram {
  statements: QlikStatement[];
}
