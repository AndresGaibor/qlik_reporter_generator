import { describe, expect, it } from "bun:test";
import { analizarProgramaQlik } from "./analizador-semantico.js";
import { compilarDataflowVNext } from "./index.js";
import { parsearProgramaQlik } from "./parser-programa.js";

const mappingScript = (applyMap: string) => `
  LIB CONNECT TO [Google BigQuery:Prod];
  [Mapa]: MAPPING LOAD codigo, descripcion;
  SQL SELECT codigo, descripcion FROM \`p.d.catalogo\`;
  [Salida]: LOAD id, ${applyMap} AS descripcion;
  SQL SELECT id, codigo FROM \`p.d.hechos\`;
`;

describe("MAPPING LOAD + ApplyMap typed-dual", () => {
  it("mantiene shape de mapping separado y registra lowering typed-dual", () => {
    const plan = analizarProgramaQlik(
      parsearProgramaQlik(
        mappingScript("ApplyMap('Mapa', codigo, 'DESCONOCIDO')"),
      ),
    );
    const mapping = plan.mappings.Mapa;
    expect(mapping).toMatchObject({
      keyField: "codigo",
      valueField: "descripcion",
    });
    expect(plan.tables.Mapa).toBeUndefined();
    expect(mapping?.relationId).toBeTruthy();
    expect(mapping?.valueDual).toBeDefined();
    const output = plan.relations.find(
      (relation) => relation.id === plan.outputRelationId,
    );
    expect(output?.fields).toEqual(["id", "descripcion"]);
    expect(output?.internalFields).toEqual(
      expect.arrayContaining(["descripcion"]),
    );
  });

  it("baja hit y miss con default a LEFT JOIN sin coerción textual global", () => {
    const result = compilarDataflowVNext(
      mappingScript("ApplyMap('Mapa', codigo, 'DESCONOCIDO')"),
    );
    expect(result.sql).toContain("LEFT JOIN");
    expect(result.sql).toMatch(/__qlik_map_[A-Za-z0-9_]+_hit/);
    expect(result.sql).toContain("CASE WHEN");
    expect(result.sql).toContain("ELSE 'DESCONOCIDO'");
    expect(result.sql).toContain("map.`__qlik_dual_descripcion__text`");
    expect(result.sql).not.toContain("APPLYMAP");
    expect(result.sql).not.toContain("CAST(map.`descripcion` AS STRING)");
  });

  it("preserva un hit cuyo valor mapped es NULL frente al default", () => {
    const script = `
      LIB CONNECT TO [Google BigQuery:Prod];
      [Mapa]: MAPPING LOAD codigo, Null() AS descripcion;
      SQL SELECT codigo FROM \`p.d.catalogo\`;
      [Salida]: LOAD id, ApplyMap('Mapa', codigo, 'DESCONOCIDO') AS descripcion;
      SQL SELECT id, codigo FROM \`p.d.hechos\`;
    `;
    const result = compilarDataflowVNext(script);
    expect(result.sql).toMatch(/__qlik_map_[A-Za-z0-9_]+_hit/);
    expect(result.sql).toMatch(
      /CASE WHEN[\s\S]+__qlik_map_[A-Za-z0-9_]+_hit[\s\S]+THEN[\s\S]+map\.`__qlik_dual_descripcion__text`[\s\S]+ELSE 'DESCONOCIDO'/,
    );
  });

  it("usa la expresión original como fallback cuando ApplyMap no recibe default", () => {
    const result = compilarDataflowVNext(
      mappingScript("ApplyMap('Mapa', codigo)"),
    );
    expect(result.sql).toContain("ELSE CAST(src.`codigo` AS STRING)");
    expect(result.sql).not.toContain("ELSE NULL");
  });

  it("permite reutilizar downstream el resultado mapped ya tipado", () => {
    const script = `
      LIB CONNECT TO [Google BigQuery:Prod];
      [Mapa]: MAPPING LOAD codigo, descripcion;
      SQL SELECT codigo, descripcion FROM \`p.d.catalogo\`;
      [Salida]: LOAD id, ApplyMap('Mapa', codigo, 'DESCONOCIDO') AS mapped;
      SQL SELECT id, codigo FROM \`p.d.hechos\`;
      [Reusada]: LOAD id, mapped AS mapped_again RESIDENT [Salida];
    `;
    const result = compilarDataflowVNext(script);
    expect(result.sql).toContain("`mapped` AS `mapped_again`");
    expect(result.sql).toContain("LEFT JOIN");
  });

  it("usa el componente numérico typed-dual en aritmética downstream", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Mapa]: MAPPING LOAD codigo, descripcion;
      SQL SELECT codigo, descripcion FROM \`p.d.catalogo\`;
      [Salida]: LOAD id, ApplyMap('Mapa', codigo, 0) AS descripcion;
      SQL SELECT id, codigo FROM \`p.d.hechos\`;
      [Reusada]: LOAD descripcion * 2 AS doble RESIDENT [Salida];
    `);

    expect(result.sql).toContain("__qlik_dual_descripcion__numeric");
    expect(result.sql).toMatch(/`__qlik_dual_descripcion__numeric`\s*\*\s*2/);
  });

  it("mantiene componentes text/numeric con default mixto", () => {
    const result = compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Mapa]: MAPPING LOAD codigo, valor;
      SQL SELECT codigo, valor FROM \`p.d.catalogo_numerico\`;
      [Salida]: LOAD id, ApplyMap('Mapa', codigo, 'N/A') AS mapped;
      SQL SELECT id, codigo FROM \`p.d.hechos\`;
      [Reusada]: LOAD id, mapped * 2 AS doubled RESIDENT [Salida];
    `);

    expect(result.sql).toContain("__qlik_dual_valor__text");
    expect(result.sql).toContain("__qlik_dual_valor__numeric");
    expect(result.sql).toContain("ELSE 'N/A'");
    expect(result.sql).not.toContain("CAST(map.`valor` AS STRING)");
  });

  it("conserva un diagnóstico explícito para mapping dinámico no certificable", () => {
    expect(() =>
      compilarDataflowVNext(`
      LIB CONNECT TO [Google BigQuery:Prod];
      [Mapa]: MAPPING LOAD codigo, descripcion;
      SQL SELECT codigo, descripcion FROM \`p.d.catalogo\`;
      [Salida]: LOAD ApplyMap(map_name, codigo, 'DESCONOCIDO') AS descripcion;
      SQL SELECT codigo FROM \`p.d.hechos\`;
    `),
    ).toThrow("APPLYMAP_MAPPING_NAME_LITERAL_REQUIRED");
  });
});
