import { describe, expect, it } from "bun:test";
import { resumirDataflowParaUsuario } from "./resumir-dataflow.js";

const encabezado = "LIB CONNECT TO [Google BigQuery:Produccion];";

function resumir(script: string) {
  return resumirDataflowParaUsuario({
    flujoId: "flujo-1",
    nombre: "Ventas diarias",
    script,
    analizadoEn: "2026-08-18T12:00:00.000Z",
  });
}

describe("resumirDataflowParaUsuario", () => {
  it("proyecta campos y filtros sin exponer SQL", () => {
    const resumen = resumir(`${encabezado}
      [salida]: LOAD [fecha_venta] AS [Fecha Venta], [total] AS [Total];
      SQL SELECT fecha_venta, total FROM \`proyecto.ventas.facturas\` WHERE total > 100;`);

    expect(resumen.estado).toBe("analizado");
    expect(resumen.fuentePrincipal).toMatchObject({
      nombre: "Facturas",
      dataset: "ventas",
    });
    expect(resumen.fuentes).toEqual([
      {
        nombre: "Facturas",
        tabla: "proyecto.ventas.facturas",
        dataset: "ventas",
        principal: true,
      },
    ]);
    expect(resumen.campos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alias: "Fecha Venta",
          nombreVisible: "Fecha Venta",
        }),
        expect.objectContaining({ alias: "Total" }),
      ]),
    );
    expect(resumen.filtros[0]).toMatchObject({
      campo: "total",
      operador: ">",
      valorPredeterminado: "100",
      obligatorio: false,
    });
    expect(JSON.stringify(resumen)).not.toContain("SELECT fecha_venta");
  });

  it("informa cuando el script no contiene filtros", () => {
    const resumen = resumir(`${encabezado}
      [salida]: LOAD [id]; SQL SELECT id FROM \`p.d.tabla\`;`);

    expect(resumen.estado).toBe("sin_filtros");
    expect(resumen.filtros).toEqual([]);
  });

  it("detecta rango de fechas inicial y final", () => {
    const resumen = resumir(`${encabezado}
      [base]: LOAD [Fecha], [Total]; SQL SELECT Fecha, Total FROM \`p.d.ventas\`;
      [desde]: LOAD [Fecha], [Total] RESIDENT [base] WHERE [Fecha] >= '2026-08-01';
      [salida]: LOAD [Fecha], [Total] RESIDENT [desde] WHERE [Fecha] <= '2026-08-31';`);

    expect(resumen.rangoTemporal).toEqual({
      campo: "Fecha",
      fechaInicial: "2026-08-01",
      fechaFinal: "2026-08-31",
    });
  });

  it("separa un WHERE compuesto y resume el límite final exclusivo como el último día incluido", () => {
    const resumen = resumir(`${encabezado}
      [base]: LOAD [Fecha], [Total]; SELECT Fecha, Total FROM \`p.d.ventas\`;
      [salida]: LOAD [Fecha], [Total] RESIDENT [base]
      WHERE [Fecha] >= '2026-07-01' AND [Fecha] < '2026-08-01';`);

    expect(resumen.filtros).toEqual([
      expect.objectContaining({
        campo: "Fecha",
        operador: ">=",
        valorPredeterminado: "2026-07-01",
      }),
      expect.objectContaining({
        campo: "Fecha",
        operador: "<",
        valorPredeterminado: "2026-08-01",
      }),
    ]);
    expect(resumen.rangoTemporal).toEqual({
      campo: "Fecha",
      fechaInicial: "2026-07-01",
      fechaFinal: "2026-07-31",
    });
  });

  it("conserva el alias visible de los campos", () => {
    const resumen = resumir(`${encabezado}
      [salida]: LOAD Upper([categoria]) AS [Categoría visible];
      SQL SELECT categoria FROM \`p.d.productos\`;`);

    expect(resumen.campos).toContainEqual({
      nombreVisible: "Categoría visible",
      alias: "Categoría visible",
      tipoInferido: "texto",
    });
  });

  it("mantiene el resumen parcial y advierte operaciones no soportadas", () => {
    const resumen = resumir(`${encabezado}
      [salida]: LOAD ApplyMap('mapa', [id]) AS [Nombre];
      SQL SELECT id FROM \`p.d.clientes\`;`);

    expect(resumen.estado).toBe("script_no_compatible");
    expect(resumen.campos.map((campo) => campo.alias)).toContain("Nombre");
    expect(resumen.advertencias.join(" ")).toContain("ApplyMap");
  });

  it("resume el error generado por Qlik sin mostrar script ni duplicados técnicos", () => {
    const resumen = resumir(`///$tab Main
      SET ThousandSep=',';
      ///$tab Generated
      TRACE('Data flow app: app-id contains validation errors. Fix Data flow validation errors to generate script');
      throw InvalidDataflow()`);

    expect(resumen.estado).toBe("script_no_compatible");
    expect(resumen.advertencias).toHaveLength(1);
    expect(resumen.advertencias[0]).toContain("corrige los pasos");
    expect(JSON.stringify(resumen)).not.toContain("ThousandSep");
    expect(JSON.stringify(resumen)).not.toContain("InvalidDataflow");
    expect(JSON.stringify(resumen)).not.toContain("app-id");
  });

  it("no confunde If() válido con una Bifurcación procedural", async () => {
    const script = await Bun.file(
      new URL(
        "../../reportes/fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik",
        import.meta.url,
      ),
    ).text();
    const resumen = resumir(script);

    expect(resumen.estado).toBe("analizado");
    expect(resumen.advertencias.join(" ")).not.toContain("Bifurcación");
    expect(resumen.advertencias.join(" ")).not.toContain("SYNTAX_INVALID_IF");
  });

  it("mantiene diagnóstico accionable para un IF procedural malformado", () => {
    const resumen = resumir(`${encabezado}
      [base]: LOAD id; SELECT id FROM \`p.d.t\`;
      IF id = 1;
    `);

    expect(resumen.estado).toBe("script_no_compatible");
    expect(resumen.advertencias.join(" ")).toContain("Bifurcación");
  });

  it("identifica el componente exacto de Qlik cuando falla una expresión dentro de un filtro con CRLF", () => {
    const script = `${encabezado}
      [Calcular campos 1]:
      LOAD
        [NOM_TIPO_UOP],
        If([NOM_TIPO_UOP] = 'TIENDA', 1, 0) AS [FILTRO_UOP];
      SQL SELECT NOM_TIPO_UOP FROM \`p.d.unidades\`;

      INNER JOIN([Calcular campos 1])
      // [Seleccionar campos 1], [Filtro 2_DEFAULT]
      LOAD [NOM_TIPO_UOP], [FILTRO_UOP];
      LOAD [NOM_TIPO_UOP], [FILTRO_UOP]
      RESIDENT [Calcular campos 1]
      WHERE NOT (CountRegEx([NOM_TIPO_UOP], [FILTRO_UOP]));
    `.replace(/\n/g, "\r\n");
    const resumen = resumir(script);

    expect(resumen.estado).toBe("script_no_compatible");
    expect(resumen.advertencias.join(" ")).toContain(
      'componente "Filtro 2_DEFAULT"',
    );
    expect(resumen.advertencias.join(" ")).toContain("CountRegEx");
  });
});
