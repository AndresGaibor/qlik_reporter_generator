import type { QlikProgram, QlikStatement } from "../ast.js";
import {
  type ValorConstanteControl,
  definirConstanteVariable,
  evaluarCondicionControl,
  evaluarControlConstante,
} from "../control-flujo.js";
import { extraerOrdenSql } from "../inter-record.js";
import type { SourceSpan } from "../modelo.js";
import { parsearCuerpoLoad } from "../parser-carga.js";
import {
  VariableQlikRuntimeError,
  definirVariableQlik,
} from "../variables-qlik.js";
import { aplicarCarga, crearFuenteCarga } from "./cargas.js";
import { fail, zeroSpan } from "./errores.js";
import type { EstadoAnalisisSemantico } from "./estado.js";
import { expandir } from "./lookups.js";
import { valoresControlIguales } from "./proyecciones.js";
import {
  type CargaPendiente,
  type ControlScope,
  type ControlSignal,
  MAX_COMPILE_TIME_ITERATIONS,
} from "./tipos.js";

export function ejecutarProgramaQlik(
  program: QlikProgram,
  estado: EstadoAnalisisSemantico,
): void {
  const { effects, tables, variables } = estado;
  let activeConnection: string | undefined;
  let pendingLoads: CargaPendiente[] = [];
  const subroutines = new Map<
    string,
    Extract<QlikStatement, { type: "sub" }>
  >();
  const callStack: string[] = [];

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

  const aplicarCargasPendientes = (sourceId: string): string => {
    let currentId = sourceId;
    for (const pending of [...pendingLoads].reverse())
      currentId = aplicarCarga(estado, pending, currentId);
    pendingLoads = [];
    return currentId;
  };

  const cargaPendienteExterna = (): CargaPendiente | undefined =>
    pendingLoads[0];

  const spanCargaPendiente = (): SourceSpan =>
    cargaPendienteExterna()?.span ?? zeroSpan();

  const ejecutarStatements = (
    statements: QlikStatement[],
    scope: ControlScope,
  ): ControlSignal | undefined => {
    for (const statement of statements) {
      const signal = ejecutarStatement(statement, scope);
      if (signal) {
        if (pendingLoads.length > 0)
          fail(
            "SYNTAX_LOAD_WITHOUT_SOURCE",
            "SYNTAX",
            "Una salida de control dejó un LOAD sin fuente asociada",
            spanCargaPendiente(),
          );
        return signal;
      }
    }
    if (pendingLoads.length > 0)
      fail(
        "SYNTAX_LOAD_WITHOUT_SOURCE",
        "SYNTAX",
        "Un bloque de control terminó con un LOAD sin fuente asociada",
        spanCargaPendiente(),
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
          const source = crearFuenteCarga(
            estado,
            spec,
            statement.span,
            evaluarNumero,
          );
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
          const loaded = aplicarCarga(estado, effectiveLoad, source.id);
          if (pendingLoads.length > 0) aplicarCargasPendientes(loaded);
        } else if (spec.resident) {
          const source = estado.table(spec.resident, statement.span);
          const loaded = aplicarCarga(estado, load, source.id, spec.resident);
          if (pendingLoads.length > 0) aplicarCargasPendientes(loaded);
        } else {
          pendingLoads.push(load);
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
        const native = estado.add({
          op: "native_sql",
          sql,
          connection: activeConnection,
          fields: [],
          schemaKnown: false,
          orderBy: extraerOrdenSql(sql),
          span: statement.span,
        });
        if (pendingLoads.length > 0) {
          aplicarCargasPendientes(native.id);
        } else {
          estado.outputRelationId = native.id;
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
        if (stored && tables[stored]) estado.outputRelationId = tables[stored];
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
        if (pendingLoads.length > 0)
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
        if (pendingLoads.length > 0)
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
    if (pendingLoads.length > 0)
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
    if (pendingLoads.length > 0)
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

  if (pendingLoads.length > 0)
    fail(
      "SYNTAX_LOAD_WITHOUT_SOURCE",
      "SYNTAX",
      "LOAD sin fuente SQL o RESIDENT asociada",
      spanCargaPendiente(),
    );
}
