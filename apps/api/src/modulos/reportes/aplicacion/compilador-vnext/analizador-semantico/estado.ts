import type {
  EfectoVNext,
  PlanCompilacionVNext,
  RelacionVNext,
} from "../ir.js";
import type { SourceSpan } from "../modelo.js";
import type { VariablesQlik } from "../variables-qlik.js";
import { fail, zeroSpan } from "./errores.js";
import type { RelacionSinId } from "./tipos.js";

export class EstadoAnalisisSemantico {
  readonly relations: RelacionVNext[] = [];
  readonly effects: EfectoVNext[] = [];
  readonly tables: Record<string, string> = {};
  readonly mappings: PlanCompilacionVNext["mappings"] = {};
  readonly variables: VariablesQlik = new Map();
  private relationSequence = 0;
  outputRelationId: string | undefined;
  lastTableName: string | undefined;

  byId(id: string): RelacionVNext {
    const relation = this.relations.find((item) => item.id === id);
    if (!relation)
      fail(
        "INTERNAL_RELATION_NOT_FOUND",
        "NAME_RESOLUTION",
        `No existe la relación ${id}`,
        zeroSpan(),
      );
    return relation;
  }

  add(relation: RelacionSinId): RelacionVNext {
    const full = {
      ...relation,
      id: `r${++this.relationSequence}`,
    } as unknown as RelacionVNext;
    this.relations.push(full);
    return full;
  }

  table(name: string, span: SourceSpan): RelacionVNext {
    const id = this.tables[name];
    if (!id)
      fail(
        "NAME_TABLE_NOT_FOUND",
        "NAME_RESOLUTION",
        `No existe la tabla Qlik [${name}]`,
        span,
      );
    return this.byId(id);
  }

  encontrarRelacionesAnteriores(
    field: string,
    currentId: string,
  ): RelacionVNext[] {
    return [...new Set(Object.values(this.tables))]
      .filter((id) => id !== currentId)
      .map((id) => this.byId(id))
      .filter((relation) => relation.fields.includes(field));
  }

  assignTable(name: string, id: string): void {
    this.tables[name] = id;
    this.lastTableName = name;
    this.outputRelationId = id;
  }

  ensureNoDualReuse(
    relation: RelacionVNext,
    operation: string,
    span: SourceSpan,
  ): void {
    const untyped = (relation.dualFields ?? []).filter(
      (field) => !relation.dualComponents?.[field],
    );
    if (untyped.length === 0) return;
    fail(
      "DUAL_FIELD_REUSE_REQUIRES_TYPED_LOWERING",
      "TYPE_SEMANTICS",
      `${operation} reutiliza valores duales (${untyped.join(", ")}) antes de preservar su componente numérico`,
      span,
    );
  }

  toPlan(): PlanCompilacionVNext {
    return {
      relations: this.relations,
      effects: this.effects,
      tables: { ...this.tables },
      mappings: { ...this.mappings },
      ...(this.outputRelationId
        ? { outputRelationId: this.outputRelationId }
        : {}),
      diagnostics: [],
    };
  }
}
