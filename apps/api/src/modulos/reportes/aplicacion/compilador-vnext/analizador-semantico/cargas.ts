import {
  contieneApplyMapQlik,
  parsearExpresionQlik,
} from "../expresiones-qlik.js";
import {
  analizarUsoInterRegistro,
  interpretarWhileIterNo,
} from "../inter-record.js";
import type { RelacionVNext } from "../ir.js";
import type { SourceSpan } from "../modelo.js";
import type { EspecificacionLoadVNext } from "../parser-carga.js";
import { fail } from "./errores.js";
import type { EstadoAnalisisSemantico } from "./estado.js";
import { resolverLookups, resolverMapSubstringLookups } from "./lookups.js";
import {
  analizarProyecciones,
  commonFields,
  sameFieldSet,
} from "./proyecciones.js";
import type { CargaPendiente } from "./tipos.js";

export function aplicarCarga(
  estado: EstadoAnalisisSemantico,
  load: CargaPendiente,
  sourceId: string,
  sourceTableName?: string,
): string {
  let current = estado.byId(sourceId);
  const mappingLookups = resolverLookups(
    load.spec.fields,
    estado.mappings,
    load.span,
  );
  const mapSubstringLookups = resolverMapSubstringLookups(
    load.spec.fields,
    estado.mappings,
    estado.relations,
    load.span,
  );
  if (
    load.spec.where &&
    contieneApplyMapQlik(parsearExpresionQlik(load.spec.where))
  )
    fail(
      "APPLYMAP_RELATIONAL_CONTEXT_UNSUPPORTED",
      "UNSUPPORTED_SEMANTICS",
      "ApplyMap en WHERE requiere un lowering relacional explícito y no puede aproximarse como escalar",
      load.span,
    );
  if (
    load.spec.groupBy.some((expression) =>
      contieneApplyMapQlik(parsearExpresionQlik(expression)),
    ) ||
    load.spec.orderBy.some((item) =>
      contieneApplyMapQlik(parsearExpresionQlik(item.expression)),
    )
  )
    fail(
      "APPLYMAP_RELATIONAL_CONTEXT_UNSUPPORTED",
      "UNSUPPORTED_SEMANTICS",
      "ApplyMap en GROUP BY/ORDER BY requiere un lowering relacional explícito y no puede aproximarse como escalar",
      load.span,
    );
  const interRecord = analizarUsoInterRegistro(
    load.spec.fields,
    load.spec.where,
  );
  const hasStatefulSemantics =
    interRecord.operations.length > 0 || load.spec.while !== undefined;

  if (hasStatefulSemantics && mappingLookups.length > 0)
    fail(
      "APPLYMAP_STATEFUL_CONTEXT_UNSUPPORTED",
      "UNSUPPORTED_SEMANTICS",
      "ApplyMap dentro de una carga inter-record requiere un lowering relacional explícito",
      load.span,
    );
  if (hasStatefulSemantics && mapSubstringLookups.length > 0)
    fail(
      "MAPSUBSTRING_STATEFUL_CONTEXT_UNSUPPORTED",
      "UNSUPPORTED_SEMANTICS",
      "MapSubstring dentro de una carga inter-record requiere un lowering relacional explícito",
      load.span,
    );

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
      ? estado.encontrarRelacionesAnteriores(
          interRecord.exists.field,
          current.id,
        )
      : [];
    const existsField = interRecord.exists?.field;
    const againstInputs = existsField
      ? previous.map((relation) => {
          if (
            relation.fields.length === 1 &&
            relation.fields[0] === existsField
          )
            return relation.id;
          return estado.add({
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
        ? estado.add({
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
    const stateful = estado.add({
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
    if (load.label) estado.assignTable(load.label, stateful.id);
    else estado.outputRelationId = stateful.id;
    return stateful.id;
  }
  const dualFields = (current.dualFields ?? []).filter(
    (field) => !current.dualComponents?.[field],
  );
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
    current = estado.add({
      op: "limit",
      input: current.id,
      limitExpression: load.prefix.limitExpression,
      fields: current.fields,
      schemaKnown: current.schemaKnown,
      dualFields: current.dualFields,
      dualComponents: current.dualComponents,
      internalFields: current.internalFields,
      span: load.span,
    });
  }

  if (load.spec.where) {
    current = estado.add({
      op: "filter",
      input: current.id,
      condition: load.spec.where,
      fields: current.fields,
      schemaKnown: current.schemaKnown,
      dualFields: current.dualFields,
      dualComponents: current.dualComponents,
      internalFields: current.internalFields,
      orderBy: current.orderBy,
      span: load.span,
    });
  }

  const projectionAnalysis = analizarProyecciones(
    load.spec.fields,
    current,
    load.prefix.type === "mapping",
  );

  if (load.spec.groupBy.length > 0) {
    if (mappingLookups.length > 0)
      fail(
        "APPLYMAP_RELATIONAL_CONTEXT_UNSUPPORTED",
        "UNSUPPORTED_SEMANTICS",
        "ApplyMap dentro de una agregación requiere un lowering relacional explícito",
        load.span,
      );
    current = estado.add({
      op: "aggregate",
      input: current.id,
      projections: load.spec.fields,
      groupBy: load.spec.groupBy,
      aggregationOrderBy: current.orderBy,
      orderBy: current.orderBy,
      fields: load.spec.fields.map((field) => field.alias),
      schemaKnown: true,
      dualFields: projectionAnalysis.dualFields,
      dualComponents: projectionAnalysis.dualComponents,
      internalFields: Object.keys(projectionAnalysis.dualComponents),
      dualExpressions: projectionAnalysis.dualExpressions,
      span: load.span,
    });
  } else if (!load.spec.wildcard) {
    current = estado.add({
      op: "project",
      input: current.id,
      projections: load.spec.fields,
      distinct: load.spec.distinct,
      fields: load.spec.fields.map((field) => field.alias),
      schemaKnown: true,
      dualFields: projectionAnalysis.dualFields,
      dualComponents: projectionAnalysis.dualComponents,
      internalFields: Object.keys(projectionAnalysis.dualComponents),
      dualExpressions: projectionAnalysis.dualExpressions,
      mappingLookups,
      mapSubstringLookups,
      orderBy: current.orderBy,
      span: load.span,
    });
  }

  if (
    (current.dualFields ?? []).some(
      (field) => !current.dualComponents?.[field],
    ) &&
    load.spec.orderBy.length > 0
  )
    fail(
      "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
      "TYPE_SEMANTICS",
      `ORDER BY reutiliza valores duales (${current.dualFields?.join(", ")}) antes de preservar su componente numérico`,
      load.span,
    );

  if (load.spec.orderBy.length > 0) {
    current = estado.add({
      op: "sort",
      input: current.id,
      orderBy: load.spec.orderBy,
      fields: current.fields,
      schemaKnown: current.schemaKnown,
      dualFields: current.dualFields,
      dualComponents: current.dualComponents,
      internalFields: current.internalFields,
      span: load.span,
    });
  }

  const prefix = load.prefix;
  if (
    (current.dualFields ?? []).some(
      (field) => !current.dualComponents?.[field],
    ) &&
    ["join", "concatenate", "keep", "crosstable", "generic"].includes(
      prefix.type,
    )
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
    const keyDual = current.dualComponents?.[keyField];
    const valueDual = current.dualComponents?.[valueField];
    estado.mappings[load.label] = {
      relationId: current.id,
      keyField,
      valueField,
      valueExpression: load.spec.fields[1]?.expression ?? valueField,
      valueIsDual: Boolean(valueDual),
      ...(keyDual ? { keyDual } : {}),
      ...(valueDual ? { valueDual } : {}),
    };
    return current.id;
  }

  if (prefix.type === "join") {
    const targetName = prefix.target ?? estado.lastTableName;
    if (!targetName)
      fail(
        "JOIN_TARGET_MISSING",
        "NAME_RESOLUTION",
        "JOIN no tiene tabla objetivo",
        load.span,
      );
    const left = estado.table(targetName, load.span);
    estado.ensureNoDualReuse(left, "JOIN", load.span);
    const keys = commonFields(left, current, load.span, "JOIN");
    const rightOnly = current.fields.filter(
      (field) => !left.fields.includes(field),
    );
    const joined = estado.add({
      op: "join",
      left: left.id,
      right: current.id,
      join: prefix.join,
      keys,
      fields: [...left.fields, ...rightOnly],
      schemaKnown: true,
      span: load.span,
    });
    estado.assignTable(targetName, joined.id);
    return joined.id;
  }

  if (prefix.type === "concatenate") {
    const targetName = prefix.target ?? estado.lastTableName;
    if (!targetName)
      fail(
        "CONCAT_TARGET_MISSING",
        "NAME_RESOLUTION",
        "Concatenate no tiene tabla objetivo",
        load.span,
      );
    const left = estado.table(targetName, load.span);
    estado.ensureNoDualReuse(left, "Concatenate", load.span);
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
    const union = estado.add({
      op: "union_all",
      inputs: [left.id, current.id],
      fields,
      schemaKnown: true,
      span: load.span,
    });
    estado.assignTable(targetName, union.id);
    return union.id;
  }

  if (prefix.type === "keep") {
    const targetName = prefix.target ?? estado.lastTableName;
    if (!targetName)
      fail(
        "KEEP_TARGET_MISSING",
        "NAME_RESOLUTION",
        "KEEP no tiene tabla objetivo",
        load.span,
      );
    const left = estado.table(targetName, load.span);
    estado.ensureNoDualReuse(left, "KEEP", load.span);
    const keys = commonFields(left, current, load.span, "KEEP");
    let leftId = left.id;
    let rightId = current.id;
    if (prefix.keep === "inner" || prefix.keep === "right") {
      leftId = estado.add({
        op: "semi_filter",
        input: left.id,
        against: current.id,
        keys,
        fields: left.fields,
        schemaKnown: true,
        span: load.span,
      }).id;
      estado.tables[targetName] = leftId;
    }
    if (prefix.keep === "inner" || prefix.keep === "left") {
      rightId = estado.add({
        op: "semi_filter",
        input: current.id,
        against: left.id,
        keys,
        fields: current.fields,
        schemaKnown: true,
        span: load.span,
      }).id;
      if (sourceTableName) estado.tables[sourceTableName] = rightId;
    }
    estado.outputRelationId = rightId;
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
    current = estado.add({
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
    current = estado.add({
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
      estado.lastTableName &&
      estado.tables[estado.lastTableName] &&
      sameFieldSet(
        estado.byId(estado.tables[estado.lastTableName] as string),
        current,
      )
    ) {
      const previous = estado.byId(
        estado.tables[estado.lastTableName] as string,
      );
      const union = estado.add({
        op: "union_all",
        inputs: [previous.id, current.id],
        fields: previous.fields,
        schemaKnown: true,
        span: load.span,
      });
      estado.tables[estado.lastTableName] = union.id;
      estado.tables[load.label] = union.id;
      estado.outputRelationId = union.id;
      return union.id;
    }
    estado.assignTable(load.label, current.id);
  } else {
    estado.outputRelationId = current.id;
  }
  return current.id;
}

export function crearFuenteCarga(
  estado: EstadoAnalisisSemantico,
  spec: EspecificacionLoadVNext,
  span: SourceSpan,
  evaluarNumero: (expression: string, span: SourceSpan) => number,
): RelacionVNext {
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
    return estado.add({
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
  return estado.add({
    op: "autogenerate",
    projections: spec.fields,
    countExpression: String(count),
    fields: spec.fields.map((field) => field.alias),
    schemaKnown: true,
    span,
  });
}
