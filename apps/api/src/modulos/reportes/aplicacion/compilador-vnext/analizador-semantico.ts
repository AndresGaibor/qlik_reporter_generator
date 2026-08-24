import type { LoadPrefix, QlikProgram } from "./ast.js";
import { esExpresionDualQlik } from "./expresiones-qlik.js";
import {
  analizarUsoInterRegistro,
  extraerOrdenSql,
  interpretarWhileIterNo,
} from "./inter-record.js";
import type { EfectoVNext, PlanCompilacionVNext, RelacionVNext } from "./ir.js";
import { ErrorCompilacionVNext, type SourceSpan } from "./modelo.js";
import {
  type EspecificacionLoadVNext,
  parsearCuerpoLoad,
} from "./parser-carga.js";
import {
  VariableQlikRuntimeError,
  type VariablesQlik,
  definirVariableQlik,
  expandirVariablesQlik,
} from "./variables-qlik.js";

type RelacionSinId = RelacionVNext extends infer R
  ? R extends { id: string }
    ? Omit<R, "id">
    : never
  : never;

interface CargaPendiente {
  label?: string;
  prefix: LoadPrefix;
  spec: EspecificacionLoadVNext;
  span: SourceSpan;
}

export function analizarProgramaQlik(
  program: QlikProgram,
): PlanCompilacionVNext {
  const relations: RelacionVNext[] = [];
  const effects: EfectoVNext[] = [];
  const tables: Record<string, string> = {};
  const mappings: PlanCompilacionVNext["mappings"] = {};
  const variables: VariablesQlik = new Map();
  let activeConnection: string | undefined;
  let pendingLoad: CargaPendiente | undefined;
  let relationSequence = 0;
  let outputRelationId: string | undefined;
  let lastTableName: string | undefined;

  const byId = (id: string): RelacionVNext => {
    const relation = relations.find((item) => item.id === id);
    if (!relation)
      fail(
        "INTERNAL_RELATION_NOT_FOUND",
        "NAME_RESOLUTION",
        `No existe la relación ${id}`,
        zeroSpan(),
      );
    return relation;
  };
  const add = (relation: RelacionSinId): RelacionVNext => {
    const full = {
      ...relation,
      id: `r${++relationSequence}`,
    } as unknown as RelacionVNext;
    relations.push(full);
    return full;
  };
  const table = (name: string, span: SourceSpan): RelacionVNext => {
    const id = tables[name];
    if (!id)
      fail(
        "NAME_TABLE_NOT_FOUND",
        "NAME_RESOLUTION",
        `No existe la tabla Qlik [${name}]`,
        span,
      );
    return byId(id);
  };
  const encontrarRelacionesAnteriores = (
    field: string,
    currentId: string,
  ): RelacionVNext[] =>
    [...new Set(Object.values(tables))]
      .filter((id) => id !== currentId)
      .map((id) => byId(id))
      .filter((relation) => relation.fields.includes(field));
  const assignTable = (name: string, id: string) => {
    tables[name] = id;
    lastTableName = name;
    outputRelationId = id;
  };
  const ensureNoDualReuse = (
    relation: RelacionVNext,
    operation: string,
    span: SourceSpan,
  ) => {
    if ((relation.dualFields?.length ?? 0) === 0) return;
    fail(
      "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
      "TYPE_SEMANTICS",
      `${operation} reutiliza valores duales (${relation.dualFields?.join(", ")}) antes de preservar su componente numérico`,
      span,
    );
  };

  const aplicarCarga = (
    load: CargaPendiente,
    sourceId: string,
    sourceTableName?: string,
  ): string => {
    let current = byId(sourceId);
    const interRecord = analizarUsoInterRegistro(
      load.spec.fields,
      load.spec.where,
    );
    const hasStatefulSemantics =
      interRecord.operations.length > 0 || load.spec.while !== undefined;

    if (hasStatefulSemantics) {
      if (!["none", "noconcatenate"].includes(load.prefix.type))
        fail(
          "STATEFUL_PREFIX_UNSUPPORTED",
          "UNSUPPORTED_SEMANTICS",
          "Las cargas inter-record no pueden combinarse con este prefijo LOAD sin una barrera semántica explícita",
          load.span,
        );
      const iterationCount = interpretarWhileIterNo(load.spec.while);
      if (iterationCount === undefined)
        fail(
          "ITERNO_WHILE_UNSUPPORTED",
          "UNSUPPORTED_SEMANTICS",
          "WHILE solo admite la forma determinista IterNo() <= N o IterNo() < N",
          load.span,
        );
      const orderBy =
        load.spec.orderBy.length > 0
          ? load.spec.orderBy
          : (current.orderBy ?? []);
      if (
        (interRecord.requiresOrder || load.spec.while !== undefined) &&
        orderBy.length === 0
      )
        fail(
          "INTER_RECORD_ORDER_REQUIRED",
          "NON_DETERMINISTIC_ORDER",
          "Las funciones inter-record requieren ORDER BY determinista en la fuente o en LOAD",
          load.span,
        );
      if (
        interRecord.operations.some(
          (operation) => operation.kind === "autonumber_hash",
        )
      )
        fail(
          "AUTONUMBER_HASH_REQUIRES_QLIK_HASH",
          "UNSUPPORTED_SEMANTICS",
          "AutoNumberHash128/256 requiere una implementación verificada del hash propietario de Qlik",
          load.span,
        );
      const previous = interRecord.exists
        ? encontrarRelacionesAnteriores(interRecord.exists.field, current.id)
        : [];
      const existsField = interRecord.exists?.field;
      const againstInputs = existsField
        ? previous.map((relation) => {
            if (
              relation.fields.length === 1 &&
              relation.fields[0] === existsField
            )
              return relation.id;
            return add({
              op: "project",
              input: relation.id,
              projections: [{ expression: existsField, alias: existsField }],
              fields: [existsField],
              schemaKnown: true,
              orderBy: relation.orderBy,
              span: load.span,
            }).id;
          })
        : [];
      const against =
        againstInputs.length > 1
          ? add({
              op: "union_all",
              inputs: againstInputs,
              fields: existsField ? [existsField] : [],
              schemaKnown: true,
              span: load.span,
            })
          : previous[0];
      if (interRecord.exists && !against)
        fail(
          "EXISTS_PREVIOUS_FIELD_NOT_FOUND",
          "NAME_RESOLUTION",
          `Exists no encuentra un campo previamente cargado: ${interRecord.exists.field}`,
          load.span,
        );
      const stateful = add({
        op: "stateful",
        input: current.id,
        fields: load.spec.fields.map((field) => field.alias),
        schemaKnown: true,
        orderBy,
        stateful: {
          projections: load.spec.fields,
          distinct: load.spec.distinct,
          ...(load.spec.where && !interRecord.exists
            ? { where: load.spec.where }
            : {}),
          ...(interRecord.exists && against
            ? { exists: { ...interRecord.exists, against: against.id } }
            : {}),
          orderBy,
          iterationCount,
          operations: interRecord.operations,
        },
        span: load.span,
      });
      if (load.label) assignTable(load.label, stateful.id);
      else outputRelationId = stateful.id;
      return stateful.id;
    }
    const dualFields = current.dualFields ?? [];
    const preservesDualWithoutReadingIt =
      load.spec.wildcard &&
      !load.spec.where &&
      load.spec.groupBy.length === 0 &&
      load.spec.orderBy.length === 0 &&
      ["none", "noconcatenate", "first"].includes(load.prefix.type);
    if (dualFields.length > 0 && !preservesDualWithoutReadingIt)
      fail(
        "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
        "TYPE_SEMANTICS",
        `La relación contiene valores duales (${dualFields.join(", ")}) y una operación posterior intenta consumirlos antes de preservar su componente numérico`,
        load.span,
      );

    if (load.prefix.type === "first") {
      current = add({
        op: "limit",
        input: current.id,
        limitExpression: load.prefix.limitExpression,
        fields: current.fields,
        schemaKnown: current.schemaKnown,
        dualFields: current.dualFields,
        span: load.span,
      });
    }

    if (load.spec.where) {
      current = add({
        op: "filter",
        input: current.id,
        condition: load.spec.where,
        fields: current.fields,
        schemaKnown: current.schemaKnown,
        orderBy: current.orderBy,
        span: load.span,
      });
    }

    const projectedDualFields = load.spec.fields
      .filter(
        (field) =>
          field.expression !== "*" && esExpresionDualQlik(field.expression),
      )
      .map((field) => field.alias);

    if (load.spec.groupBy.length > 0) {
      current = add({
        op: "aggregate",
        input: current.id,
        projections: load.spec.fields,
        groupBy: load.spec.groupBy,
        fields: load.spec.fields.map((field) => field.alias),
        schemaKnown: true,
        dualFields: projectedDualFields,
        span: load.span,
      });
    } else if (!load.spec.wildcard) {
      current = add({
        op: "project",
        input: current.id,
        projections: load.spec.fields,
        distinct: load.spec.distinct,
        fields: load.spec.fields.map((field) => field.alias),
        schemaKnown: true,
        dualFields: projectedDualFields,
        orderBy: current.orderBy,
        span: load.span,
      });
    }

    if ((current.dualFields?.length ?? 0) > 0 && load.spec.orderBy.length > 0)
      fail(
        "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
        "TYPE_SEMANTICS",
        `ORDER BY reutiliza valores duales (${current.dualFields?.join(", ")}) antes de preservar su componente numérico`,
        load.span,
      );

    if (load.spec.orderBy.length > 0) {
      current = add({
        op: "sort",
        input: current.id,
        orderBy: load.spec.orderBy,
        fields: current.fields,
        schemaKnown: current.schemaKnown,
        span: load.span,
      });
    }

    const prefix = load.prefix;
    if (
      (current.dualFields?.length ?? 0) > 0 &&
      [
        "join",
        "concatenate",
        "keep",
        "crosstable",
        "generic",
        "mapping",
      ].includes(prefix.type)
    )
      fail(
        "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
        "TYPE_SEMANTICS",
        `${prefix.type} reutiliza valores duales (${current.dualFields?.join(", ")}) antes de preservar su componente numérico`,
        load.span,
      );

    if (prefix.type === "mapping") {
      if (!load.label)
        fail(
          "MAPPING_LABEL_REQUIRED",
          "NAME_RESOLUTION",
          "MAPPING LOAD requiere un nombre de tabla de mapping",
          load.span,
        );
      if (!current.schemaKnown || current.fields.length !== 2)
        fail(
          "MAPPING_REQUIRES_TWO_FIELDS",
          "TYPE_SEMANTICS",
          "MAPPING LOAD debe producir exactamente dos campos: clave y valor",
          load.span,
        );
      mappings[load.label] = {
        relationId: current.id,
        keyField: current.fields[0]!,
        valueField: current.fields[1]!,
      };
      return current.id;
    }

    if (prefix.type === "join") {
      const targetName = prefix.target ?? lastTableName;
      if (!targetName)
        fail(
          "JOIN_TARGET_MISSING",
          "NAME_RESOLUTION",
          "JOIN no tiene tabla objetivo",
          load.span,
        );
      const left = table(targetName, load.span);
      ensureNoDualReuse(left, "JOIN", load.span);
      const keys = commonFields(left, current, load.span, "JOIN");
      const rightOnly = current.fields.filter(
        (field) => !left.fields.includes(field),
      );
      const joined = add({
        op: "join",
        left: left.id,
        right: current.id,
        join: prefix.join,
        keys,
        fields: [...left.fields, ...rightOnly],
        schemaKnown: true,
        span: load.span,
      });
      assignTable(targetName, joined.id);
      return joined.id;
    }

    if (prefix.type === "concatenate") {
      const targetName = prefix.target ?? lastTableName;
      if (!targetName)
        fail(
          "CONCAT_TARGET_MISSING",
          "NAME_RESOLUTION",
          "Concatenate no tiene tabla objetivo",
          load.span,
        );
      const left = table(targetName, load.span);
      ensureNoDualReuse(left, "Concatenate", load.span);
      if (!left.schemaKnown || !current.schemaKnown) {
        fail(
          "CONCAT_SCHEMA_UNKNOWN",
          "TYPE_SEMANTICS",
          "Concatenate requiere conocer los campos de ambas tablas",
          load.span,
        );
      }
      const fields = [
        ...left.fields,
        ...current.fields.filter((field) => !left.fields.includes(field)),
      ];
      const union = add({
        op: "union_all",
        inputs: [left.id, current.id],
        fields,
        schemaKnown: true,
        span: load.span,
      });
      assignTable(targetName, union.id);
      return union.id;
    }

    if (prefix.type === "keep") {
      const targetName = prefix.target ?? lastTableName;
      if (!targetName)
        fail(
          "KEEP_TARGET_MISSING",
          "NAME_RESOLUTION",
          "KEEP no tiene tabla objetivo",
          load.span,
        );
      const left = table(targetName, load.span);
      ensureNoDualReuse(left, "KEEP", load.span);
      const keys = commonFields(left, current, load.span, "KEEP");
      let leftId = left.id;
      let rightId = current.id;
      if (prefix.keep === "inner" || prefix.keep === "right") {
        leftId = add({
          op: "semi_filter",
          input: left.id,
          against: current.id,
          keys,
          fields: left.fields,
          schemaKnown: true,
          span: load.span,
        }).id;
        tables[targetName] = leftId;
      }
      if (prefix.keep === "inner" || prefix.keep === "left") {
        rightId = add({
          op: "semi_filter",
          input: current.id,
          against: left.id,
          keys,
          fields: current.fields,
          schemaKnown: true,
          span: load.span,
        }).id;
        if (sourceTableName) tables[sourceTableName] = rightId;
      }
      outputRelationId = rightId;
      return rightId;
    }

    if (prefix.type === "crosstable") {
      if (!current.schemaKnown)
        fail(
          "CROSSTABLE_SCHEMA_UNKNOWN",
          "TYPE_SEMANTICS",
          "Crosstable requiere esquema conocido",
          load.span,
        );
      const qualifierFields = current.fields.slice(0, prefix.qualifierFields);
      const valueFields = current.fields.slice(prefix.qualifierFields);
      current = add({
        op: "unpivot",
        input: current.id,
        attributeField: prefix.attributeField,
        dataField: prefix.dataField,
        qualifierFields,
        valueFields,
        includeNulls: true,
        fields: [...qualifierFields, prefix.attributeField, prefix.dataField],
        schemaKnown: true,
        span: load.span,
      });
    } else if (prefix.type === "generic") {
      current = add({
        op: "generic",
        input: current.id,
        fields: current.fields,
        schemaKnown: current.schemaKnown,
        span: load.span,
      });
    }

    if (load.label) {
      if (
        prefix.type === "none" &&
        lastTableName &&
        tables[lastTableName] &&
        sameFieldSet(byId(tables[lastTableName] as string), current)
      ) {
        const previous = byId(tables[lastTableName] as string);
        const union = add({
          op: "union_all",
          inputs: [previous.id, current.id],
          fields: previous.fields,
          schemaKnown: true,
          span: load.span,
        });
        tables[lastTableName] = union.id;
        tables[load.label] = union.id;
        outputRelationId = union.id;
        return union.id;
      }
      assignTable(load.label, current.id);
    } else {
      outputRelationId = current.id;
    }
    return current.id;
  };

  for (const statement of program.statements) {
    switch (statement.type) {
      case "connect":
        activeConnection = expandir(
          statement.connection,
          variables,
          statement.span,
        );
        break;
      case "load": {
        if (pendingLoad)
          fail(
            "SYNTAX_LOAD_WITHOUT_SOURCE",
            "SYNTAX",
            "Existe un LOAD pendiente sin fuente asociada",
            pendingLoad.span,
          );
        const bodyExpandido = expandir(
          statement.body,
          variables,
          statement.span,
        );
        const spec = parsearCuerpoLoad(bodyExpandido);
        const load: CargaPendiente = {
          ...(statement.label ? { label: statement.label } : {}),
          prefix: statement.prefix,
          spec,
          span: statement.span,
        };
        if (spec.resident) {
          const source = table(spec.resident, statement.span);
          aplicarCarga(load, source.id, spec.resident);
        } else {
          pendingLoad = load;
        }
        break;
      }
      case "native_sql": {
        if (!activeConnection || !/big\s*query/i.test(activeConnection)) {
          fail(
            "SOURCE_CONNECTION_NOT_BIGQUERY",
            "UNSUPPORTED_SEMANTICS",
            `La fuente SQL activa no es BigQuery: ${activeConnection ?? "sin conexión"}`,
            statement.span,
          );
        }
        const sql = expandir(statement.sql.text, variables, statement.span);
        const native = add({
          op: "native_sql",
          sql,
          connection: activeConnection,
          fields: [],
          schemaKnown: false,
          orderBy: extraerOrdenSql(sql),
          span: statement.span,
        });
        if (pendingLoad) {
          aplicarCarga(pendingLoad, native.id);
          pendingLoad = undefined;
        } else {
          outputRelationId = native.id;
        }
        break;
      }
      case "set": {
        const defined = definirVariableQlik(
          statement.mode,
          statement.body,
          variables,
        );
        effects.push({
          kind: "define_variable",
          mode: statement.mode,
          body: defined?.bodyExpandido ?? statement.body,
          span: statement.span,
        });
        break;
      }
      case "store": {
        effects.push({
          kind: "store",
          body: statement.body,
          span: statement.span,
        });
        const stored = statement.body.match(/^\s*\[([^\]]+)\]/)?.[1];
        if (stored && tables[stored]) outputRelationId = tables[stored];
        break;
      }
      case "drop": {
        effects.push({
          kind: "drop",
          body: statement.body,
          span: statement.span,
        });
        for (const match of statement.body.matchAll(/\[([^\]]+)\]/g))
          delete tables[match[1] ?? ""];
        break;
      }
      case "unsupported":
        fail(
          "SYNTAX_UNCONSUMED_TOKENS",
          "SYNTAX",
          `Sentencia Qlik no consumida: ${statement.keyword}`,
          statement.span,
          statement.raw,
        );
    }
  }

  if (pendingLoad)
    fail(
      "SYNTAX_LOAD_WITHOUT_SOURCE",
      "SYNTAX",
      "LOAD sin fuente SQL o RESIDENT asociada",
      pendingLoad.span,
    );

  return {
    relations,
    effects,
    tables: { ...tables },
    mappings: { ...mappings },
    ...(outputRelationId ? { outputRelationId } : {}),
    diagnostics: [],
  };
}

function expandir(
  text: string,
  variables: VariablesQlik,
  span: SourceSpan,
): string {
  try {
    return expandirVariablesQlik(text, variables);
  } catch (error) {
    if (error instanceof VariableQlikRuntimeError)
      fail(
        "VARIABLE_LET_RUNTIME_REQUIRED",
        "UNSUPPORTED_SEMANTICS",
        error.message,
        span,
      );
    throw error;
  }
}

function commonFields(
  left: RelacionVNext,
  right: RelacionVNext,
  span: SourceSpan,
  operation: string,
): string[] {
  if (!left.schemaKnown || !right.schemaKnown) {
    fail(
      `${operation}_SCHEMA_UNKNOWN`,
      "TYPE_SEMANTICS",
      `${operation} requiere conocer los campos de ambas tablas`,
      span,
    );
  }
  const keys = left.fields.filter((field) => right.fields.includes(field));
  if (keys.length === 0)
    fail(
      `${operation}_NO_COMMON_FIELDS`,
      "TYPE_SEMANTICS",
      `${operation} Qlik requiere al menos un campo común`,
      span,
    );
  return keys;
}

function sameFieldSet(left: RelacionVNext, right: RelacionVNext): boolean {
  return (
    left.schemaKnown &&
    right.schemaKnown &&
    left.fields.length === right.fields.length &&
    left.fields.every((field) => right.fields.includes(field))
  );
}

function fail(
  code: string,
  category: ConstructorParameters<typeof ErrorCompilacionVNext>[0]["category"],
  message: string,
  span: SourceSpan,
  snippet?: string,
): never {
  throw new ErrorCompilacionVNext({
    code,
    category,
    message,
    span,
    ...(snippet ? { snippet: snippet.slice(0, 160) } : {}),
  });
}

function zeroSpan(): SourceSpan {
  return { start: 0, end: 0, line: 1, column: 1, endLine: 1, endColumn: 1 };
}
