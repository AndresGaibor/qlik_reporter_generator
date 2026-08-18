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
});
