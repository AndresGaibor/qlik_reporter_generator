import type { SourceSpan } from "./modelo.js";

export interface NativeSqlSource {
  dialect: "bigquery";
  text: string;
  span: SourceSpan;
}

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
  | {
      type: "if";
      branches: QlikIfBranch[];
      elseStatements: QlikStatement[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "switch";
      expression: string;
      cases: QlikSwitchCase[];
      defaultStatements: QlikStatement[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "for";
      variable: string;
      mode: "counter" | "each";
      from?: string;
      to?: string;
      step?: string;
      values?: string[];
      body: QlikStatement[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "do";
      entryCondition?: { mode: "while" | "until"; expression: string };
      exitCondition?: { mode: "while" | "until"; expression: string };
      body: QlikStatement[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "sub";
      name: string;
      parameters: string[];
      body: QlikStatement[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "call";
      name: string;
      arguments: string[];
      span: SourceSpan;
      raw: string;
    }
  | {
      type: "exit";
      target: "script" | "for" | "do" | "sub";
      modifier?: "when" | "unless";
      condition?: string;
      span: SourceSpan;
      raw: string;
    }
  | { type: "unsupported"; keyword: string; span: SourceSpan; raw: string };

export interface QlikIfBranch {
  condition: string;
  statements: QlikStatement[];
  span: SourceSpan;
}

export interface QlikSwitchCase {
  values: string[];
  statements: QlikStatement[];
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

export interface QlikProgram {
  statements: QlikStatement[];
}
