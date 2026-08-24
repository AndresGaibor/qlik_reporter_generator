import type { LoadPrefix, QlikProgram, QlikStatement } from "./ast.js";
import {
  type ValorConstanteControl,
  definirConstanteVariable,
  evaluarCondicionControl,
  evaluarControlConstante,
} from "./control-flujo.js";
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

type ControlSignal = "script" | "for" | "do" | "sub";
type ControlScope = { inFor: boolean; inDo: boolean; inSub: boolean };
const MAX_COMPILE_TIME_ITERATIONS = 10_000;

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
  const subroutines = new Map<
    string,
    Extract<QlikStatement, { type: "sub" }>
  >();
  const callStack: string[] = [];

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
      const keyField = current.fields[0];
      const valueField = current.fields[1];
      if (!keyField || !valueField)
        fail(
          "MAPPING_REQUIRES_TWO_FIELDS",
          "TYPE_SEMANTICS",
          "MAPPING LOAD debe producir exactamente dos campos: clave y valor",
          load.span,
        );
      mappings[load.label] = {
        relationId: current.id,
        keyField,
        valueField,
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

  const crearFuenteCarga = (
    spec: EspecificacionLoadVNext,
    span: SourceSpan,
  ): RelacionVNext => {
    if (!spec.source)
      fail(
        "INTERNAL_SOURCE_NOT_FOUND",
        "NAME_RESOLUTION",
        "La carga no tiene fuente inline/autogenerate",
        span,
      );
    if (spec.source.type === "inline") {
      if (spec.source.fields.length === 0)
        fail(
          "INLINE_FIELDS_REQUIRED",
          "SYNTAX",
          "INLINE requiere una fila de cabecera",
          span,
        );
      return add({
        op: "inline",
        columns: spec.source.fields,
        rows: spec.source.rows,
        fields: spec.source.fields,
        schemaKnown: true,
        span,
      });
    }
    const count = evaluarNumero(spec.source.countExpression, span);
    if (!Number.isInteger(count) || count < 0)
      fail(
        "AUTOGENERATE_COUNT_INVALID",
        "TYPE_SEMANTICS",
        "AUTOGENERATE requiere un número entero no negativo",
        span,
      );
    return add({
      op: "autogenerate",
      projections: spec.fields,
      countExpression: String(count),
      fields: spec.fields.map((field) => field.alias),
      schemaKnown: true,
      span,
    });
  };

  const collectSubroutines = (statements: QlikStatement[]): void => {
    for (const statement of statements) {
      if (statement.type === "sub") {
        const key = statement.name.toLowerCase();
        if (subroutines.has(key))
          fail(
            "CONTROL_FLOW_DUPLICATE_SUB",
            "UNSUPPORTED_SEMANTICS",
            `SUB duplicado: ${statement.name}`,
            statement.span,
          );
        subroutines.set(key, statement);
        collectSubroutines(statement.body);
      } else if (statement.type === "if") {
        for (const branch of statement.branches)
          collectSubroutines(branch.statements);
        collectSubroutines(statement.elseStatements);
      } else if (statement.type === "switch") {
        for (const current of statement.cases)
          collectSubroutines(current.statements);
        collectSubroutines(statement.defaultStatements);
      } else if (statement.type === "for" || statement.type === "do") {
        collectSubroutines(statement.body);
      }
    }
  };

  const ejecutarStatements = (
    statements: QlikStatement[],
    scope: ControlScope,
  ): ControlSignal | undefined => {
    for (const statement of statements) {
      const signal = ejecutarStatement(statement, scope);
      if (signal) {
        if (pendingLoad)
          fail(
            "SYNTAX_LOAD_WITHOUT_SOURCE",
            "SYNTAX",
            "Una salida de control dejó un LOAD sin fuente asociada",
            pendingLoad.span,
          );
        return signal;
      }
    }
    if (pendingLoad)
      fail(
        "SYNTAX_LOAD_WITHOUT_SOURCE",
        "SYNTAX",
        "Un bloque de control terminó con un LOAD sin fuente asociada",
        pendingLoad.span,
      );
    return undefined;
  };

  const ejecutarStatement = (
    statement: QlikStatement,
    scope: ControlScope,
  ): ControlSignal | undefined => {
    switch (statement.type) {
      case "connect":
        activeConnection = expandir(
          statement.connection,
          variables,
          statement.span,
        );
        return undefined;
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
        if (spec.source) {
          const source = crearFuenteCarga(spec, statement.span);
          const effectiveLoad =
            spec.source.type === "autogenerate"
              ? {
                  ...load,
                  spec: {
                    ...spec,
                    fields: [{ expression: "*", alias: "*" }],
                    wildcard: true,
                  },
                }
              : load;
          aplicarCarga(effectiveLoad, source.id);
        } else if (spec.resident) {
          const source = table(spec.resident, statement.span);
          aplicarCarga(load, source.id, spec.resident);
        } else {
          pendingLoad = load;
        }
        return undefined;
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
        return undefined;
      }
      case "set": {
        try {
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
        } catch (error) {
          if (error instanceof VariableQlikRuntimeError)
            fail(
              "VARIABLE_LET_RUNTIME_REQUIRED",
              "UNSUPPORTED_SEMANTICS",
              error.message,
              statement.span,
            );
          throw error;
        }
        return undefined;
      }
      case "store": {
        effects.push({
          kind: "store",
          body: statement.body,
          span: statement.span,
        });
        const stored = statement.body.match(/^\s*\[([^\]]+)\]/)?.[1];
        if (stored && tables[stored]) outputRelationId = tables[stored];
        return undefined;
      }
      case "drop": {
        effects.push({
          kind: "drop",
          body: statement.body,
          span: statement.span,
        });
        for (const match of statement.body.matchAll(/\[([^\]]+)\]/g))
          delete tables[match[1] ?? ""];
        return undefined;
      }
      case "if": {
        if (pendingLoad)
          fail(
            "SYNTAX_LOAD_WITHOUT_SOURCE",
            "SYNTAX",
            "IF no puede interrumpir un LOAD pendiente",
            statement.span,
          );
        for (const branch of statement.branches) {
          const selected = evaluarCondicion(branch.condition, statement.span);
          if (selected) return ejecutarStatements(branch.statements, scope);
        }
        return ejecutarStatements(statement.elseStatements, scope);
      }
      case "switch": {
        if (pendingLoad)
          fail(
            "SYNTAX_LOAD_WITHOUT_SOURCE",
            "SYNTAX",
            "SWITCH no puede interrumpir un LOAD pendiente",
            statement.span,
          );
        const value = evaluarValor(statement.expression, statement.span);
        for (const current of statement.cases) {
          if (
            current.values.some((item) =>
              valoresControlIguales(value, evaluarValor(item, statement.span)),
            )
          )
            return ejecutarStatements(current.statements, scope);
        }
        return ejecutarStatements(statement.defaultStatements, scope);
      }
      case "for":
        return ejecutarFor(statement, scope);
      case "do":
        return ejecutarDo(statement, scope);
      case "sub": {
        return undefined;
      }
      case "call":
        return ejecutarCall(statement, scope);
      case "exit": {
        const shouldExit = statement.condition
          ? evaluarCondicion(statement.condition, statement.span)
          : true;
        const active =
          statement.modifier === "unless" ? !shouldExit : shouldExit;
        if (!active) return undefined;
        if (statement.target === "for" && !scope.inFor)
          fail(
            "CONTROL_FLOW_EXIT_CONTEXT_UNSUPPORTED",
            "UNSUPPORTED_SEMANTICS",
            "EXIT FOR fuera de un FOR activo",
            statement.span,
          );
        if (statement.target === "do" && !scope.inDo)
          fail(
            "CONTROL_FLOW_EXIT_CONTEXT_UNSUPPORTED",
            "UNSUPPORTED_SEMANTICS",
            "EXIT DO fuera de un DO activo",
            statement.span,
          );
        if (statement.target === "sub" && !scope.inSub)
          fail(
            "CONTROL_FLOW_EXIT_CONTEXT_UNSUPPORTED",
            "UNSUPPORTED_SEMANTICS",
            "EXIT SUB fuera de un SUB activo",
            statement.span,
          );
        return statement.target;
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
  };

  const evaluarCondicion = (expression: string, span: SourceSpan): boolean => {
    const value = evaluarCondicionControl(expression, variables);
    if (value === undefined)
      fail(
        "CONTROL_FLOW_RUNTIME_CONDITION_UNSUPPORTED",
        "UNSUPPORTED_SEMANTICS",
        `La condición de control requiere datos o estado runtime: ${expression}`,
        span,
      );
    return value;
  };

  const evaluarValor = (
    expression: string,
    span: SourceSpan,
  ): ValorConstanteControl => {
    const value = evaluarControlConstante(expression, variables);
    if (value === undefined)
      fail(
        "CONTROL_FLOW_RUNTIME_CONDITION_UNSUPPORTED",
        "UNSUPPORTED_SEMANTICS",
        `La expresión de control requiere evaluación runtime: ${expression}`,
        span,
      );
    return value;
  };

  const ejecutarFor = (
    statement: Extract<QlikStatement, { type: "for" }>,
    scope: ControlScope,
  ): ControlSignal | undefined => {
    if (pendingLoad)
      fail(
        "SYNTAX_LOAD_WITHOUT_SOURCE",
        "SYNTAX",
        "FOR no puede interrumpir un LOAD pendiente",
        statement.span,
      );
    const values: ValorConstanteControl[] = [];
    if (statement.mode === "each") {
      for (const expression of statement.values ?? []) {
        if (
          /\b(?:FileList|DirList|FileDir|GetFolderPath|FieldValueList)\s*\(/i.test(
            expression,
          )
        )
          fail(
            "CONTROL_FLOW_EXTERNAL_ENUMERATION_UNSUPPORTED",
            "EXTERNAL_DEPENDENCY",
            "FOR EACH requiere enumerar archivos o directorios externos; configure un adaptador explícito",
            statement.span,
          );
        const value = evaluarControlConstante(expression, variables);
        if (value === undefined)
          fail(
            "CONTROL_FLOW_RUNTIME_ENUMERATION_UNSUPPORTED",
            "UNSUPPORTED_SEMANTICS",
            `FOR EACH requiere una lista compile-time: ${expression}`,
            statement.span,
          );
        values.push(value);
      }
    } else {
      const from = evaluarNumero(statement.from ?? "", statement.span);
      const to = evaluarNumero(statement.to ?? "", statement.span);
      const step = evaluarNumero(statement.step ?? "1", statement.span);
      if (step === 0)
        fail(
          "CONTROL_FLOW_NON_TERMINATING",
          "UNSUPPORTED_SEMANTICS",
          "FOR STEP 0 no puede terminar",
          statement.span,
        );
      for (
        let value = from, iteration = 0;
        step > 0 ? value <= to : value >= to;
        value += step
      ) {
        if (++iteration > MAX_COMPILE_TIME_ITERATIONS)
          fail(
            "CONTROL_FLOW_NON_TERMINATING",
            "UNSUPPORTED_SEMANTICS",
            "FOR excede el límite de desenrollado compile-time",
            statement.span,
          );
        values.push(value);
      }
    }
    for (const value of values) {
      definirConstanteVariable(variables, statement.variable, value);
      const signal = ejecutarStatements(statement.body, {
        ...scope,
        inFor: true,
      });
      if (signal === "for") return undefined;
      if (signal) return signal;
    }
    return undefined;
  };

  const ejecutarDo = (
    statement: Extract<QlikStatement, { type: "do" }>,
    scope: ControlScope,
  ): ControlSignal | undefined => {
    if (pendingLoad)
      fail(
        "SYNTAX_LOAD_WITHOUT_SOURCE",
        "SYNTAX",
        "DO no puede interrumpir un LOAD pendiente",
        statement.span,
      );
    if (
      statement.entryCondition &&
      !evaluarCondicionLoop(
        statement.entryCondition.mode,
        statement.entryCondition.expression,
        statement.span,
      )
    )
      return undefined;
    for (
      let iteration = 0;
      iteration < MAX_COMPILE_TIME_ITERATIONS;
      iteration += 1
    ) {
      const signal = ejecutarStatements(statement.body, {
        ...scope,
        inDo: true,
      });
      if (signal === "do") return undefined;
      if (signal) return signal;
      if (
        statement.exitCondition &&
        debeSalirLoop(
          statement.exitCondition.mode,
          statement.exitCondition.expression,
          statement.span,
        )
      )
        return undefined;
      if (
        !statement.entryCondition &&
        !statement.exitCondition &&
        iteration === MAX_COMPILE_TIME_ITERATIONS - 1
      )
        break;
      if (
        statement.entryCondition &&
        !evaluarCondicionLoop(
          statement.entryCondition.mode,
          statement.entryCondition.expression,
          statement.span,
        )
      )
        return undefined;
    }
    fail(
      "CONTROL_FLOW_NON_TERMINATING",
      "UNSUPPORTED_SEMANTICS",
      "DO..LOOP no demuestra una terminación compile-time",
      statement.span,
    );
  };

  const ejecutarCall = (
    statement: Extract<QlikStatement, { type: "call" }>,
    scope: ControlScope,
  ): ControlSignal | undefined => {
    const sub = subroutines.get(statement.name.toLowerCase());
    if (!sub)
      fail(
        "CONTROL_FLOW_SUB_NOT_DEFINED",
        "NAME_RESOLUTION",
        `CALL requiere un SUB previo: ${statement.name}`,
        statement.span,
      );
    if (callStack.includes(statement.name.toLowerCase()))
      fail(
        "CONTROL_FLOW_RECURSIVE_CALL_UNSUPPORTED",
        "UNSUPPORTED_SEMANTICS",
        `CALL recursivo: ${statement.name}`,
        statement.span,
      );
    if (sub.parameters.length !== statement.arguments.length)
      fail(
        "CONTROL_FLOW_SUB_ARITY_MISMATCH",
        "TYPE_SEMANTICS",
        `CALL ${statement.name} requiere ${sub.parameters.length} parámetros`,
        statement.span,
      );
    const previous = new Map<string, ReturnType<typeof variables.get>>();
    for (let index = 0; index < sub.parameters.length; index += 1) {
      const parameter = sub.parameters[index];
      const argument = statement.arguments[index];
      if (!parameter || argument === undefined)
        fail(
          "CONTROL_FLOW_CALL_ARITY",
          "TYPE_SEMANTICS",
          `CALL ${statement.name} recibió una cantidad inválida de argumentos`,
          statement.span,
        );
      previous.set(parameter, variables.get(parameter));
      definirConstanteVariable(
        variables,
        parameter,
        evaluarValor(argument, statement.span),
      );
    }
    callStack.push(statement.name.toLowerCase());
    try {
      const signal = ejecutarStatements(sub.body, { ...scope, inSub: true });
      return signal === "sub" ? undefined : signal;
    } finally {
      callStack.pop();
      for (const [parameter, value] of previous) {
        if (value) variables.set(parameter, value);
        else variables.delete(parameter);
      }
    }
  };

  const evaluarNumero = (expression: string, span: SourceSpan): number => {
    const value = evaluarControlConstante(expression, variables);
    if (value === undefined)
      fail(
        "CONTROL_FLOW_RUNTIME_BOUND_UNSUPPORTED",
        "UNSUPPORTED_SEMANTICS",
        `El límite del control requiere evaluación runtime: ${expression}`,
        span,
      );
    if (typeof value !== "number" || !Number.isFinite(value))
      fail(
        "CONTROL_FLOW_COUNTER_NOT_NUMERIC",
        "TYPE_SEMANTICS",
        `El contador de control no es numérico: ${expression}`,
        span,
      );
    return value;
  };

  const evaluarCondicionLoop = (
    mode: "while" | "until",
    expression: string,
    span: SourceSpan,
  ): boolean =>
    mode === "while"
      ? evaluarCondicion(expression, span)
      : !evaluarCondicion(expression, span);

  const debeSalirLoop = (
    mode: "while" | "until",
    expression: string,
    span: SourceSpan,
  ): boolean =>
    mode === "while"
      ? !evaluarCondicion(expression, span)
      : evaluarCondicion(expression, span);

  collectSubroutines(program.statements);
  ejecutarStatements(program.statements, {
    inFor: false,
    inDo: false,
    inSub: false,
  });

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

function valoresControlIguales(
  left: ValorConstanteControl,
  right: ValorConstanteControl,
): boolean {
  return left === right;
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
