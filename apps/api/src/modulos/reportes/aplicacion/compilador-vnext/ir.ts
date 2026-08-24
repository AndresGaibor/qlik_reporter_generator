import type { StatefulLoadVNext } from "./inter-record.js";
import type { DiagnosticoVNext, SourceSpan } from "./modelo.js";
import type { CampoLoadVNext, OrdenLoadVNext } from "./parser-carga.js";

interface RelationBase {
  id: string;
  fields: string[];
  schemaKnown: boolean;
  dualFields?: string[];
  span: SourceSpan;
  orderBy?: OrdenLoadVNext[];
}

export type RelacionVNext =
  | (RelationBase & {
      op: "native_sql";
      sql: string;
      connection: string;
      logicalName?: string;
    })
  | (RelationBase & { op: "filter"; input: string; condition: string })
  | (RelationBase & {
      op: "project";
      input: string;
      projections: CampoLoadVNext[];
      distinct?: boolean;
    })
  | (RelationBase & {
      op: "aggregate";
      input: string;
      projections: CampoLoadVNext[];
      groupBy: string[];
    })
  | (RelationBase & { op: "sort"; input: string; orderBy: OrdenLoadVNext[] })
  | (RelationBase & { op: "limit"; input: string; limitExpression: string })
  | (RelationBase & {
      op: "join";
      left: string;
      right: string;
      join: "inner" | "left" | "right" | "full";
      keys: string[];
    })
  | (RelationBase & { op: "union_all"; inputs: string[] })
  | (RelationBase & {
      op: "semi_filter";
      input: string;
      against: string;
      keys: string[];
    })
  | (RelationBase & {
      op: "unpivot";
      input: string;
      attributeField: string;
      dataField: string;
      qualifierFields: string[];
      valueFields: string[];
      includeNulls: boolean;
    })
  | (RelationBase & { op: "generic"; input: string })
  | (RelationBase & {
      op: "stateful";
      input: string;
      stateful: StatefulLoadVNext;
    });

export type EfectoVNext =
  | {
      kind: "define_variable";
      mode: "set" | "let";
      body: string;
      span: SourceSpan;
    }
  | { kind: "store"; body: string; span: SourceSpan }
  | { kind: "drop"; body: string; span: SourceSpan };

export interface MappingTableVNext {
  relationId: string;
  keyField: string;
  valueField: string;
}

export interface PlanCompilacionVNext {
  relations: RelacionVNext[];
  effects: EfectoVNext[];
  tables: Record<string, string>;
  mappings: Record<string, MappingTableVNext>;
  outputRelationId?: string;
  diagnostics: DiagnosticoVNext[];
}
