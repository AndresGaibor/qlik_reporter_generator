import { describe, expect, it } from "bun:test";
import { generarDatosPreview } from "./generador-datos-preview";

describe("generarDatosPreview", () => {
  it("genera datos sintéticos deterministas según tipo y heurística de nombre", () => {
    const opciones = {
      columnas: [
        { nombre: "Nombre", tipo: "STRING" },
        { nombre: "FECHA", tipo: "DATE" },
        { nombre: "Cantidad", tipo: "INT64" },
        { nombre: "Costo de Venta", tipo: "NUMERIC" },
        { nombre: "Año_year", tipo: "INT64" },
        { nombre: "NOM_MES", tipo: "STRING" },
        { nombre: "Código de Barras", tipo: "STRING" },
      ],
      cantidadFilas: 5,
      semilla: "fuente-ventas",
    };

    const primero = generarDatosPreview(opciones);
    const segundo = generarDatosPreview(opciones);

    expect(primero).toEqual(segundo);
    expect(primero.filas).toHaveLength(5);
    expect(primero.filas[0][0]).toMatch(/Ejemplo|Nombre/i);
    expect(primero.filas[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(Number(primero.filas[0][2]))).toBe(true);
    expect(Number.isFinite(Number(primero.filas[0][3]))).toBe(true);
    expect(primero.filas[0][4]).toBe("2026");
    expect(primero.filas[0][5]).toBe("Julio");
    expect(primero.filas[0][6]).toMatch(/^786\d{10}$/);
  });

  it("genera formatos útiles para tipos temporales y booleanos", () => {
    const resultado = generarDatosPreview({
      columnas: [
        { nombre: "fecha", tipo: "DATE" },
        { nombre: "fecha_hora", tipo: "DATETIME" },
        { nombre: "instante", tipo: "TIMESTAMP" },
        { nombre: "hora", tipo: "TIME" },
        { nombre: "activo", tipo: "BOOLEAN" },
      ],
      cantidadFilas: 1,
      semilla: "tipos",
    });

    expect(resultado.filas[0][0]).toMatch(/^2026-07-\d{2}$/);
    expect(resultado.filas[0][1]).toMatch(/^2026-07-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(resultado.filas[0][2]).toMatch(/^2026-07-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(resultado.filas[0][3]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(["Sí", "No"]).toContain(resultado.filas[0][4]);
  });

  it("comparte claves sintéticas entre fuentes aunque tengan semillas distintas", () => {
    const izquierda = generarDatosPreview({
      columnas: [
        { nombre: "id", tipo: "INT64" },
        { nombre: "nombre", tipo: "STRING" },
      ],
      cantidadFilas: 3,
      semilla: "izquierda",
      clavesJoin: ["id"],
    });
    const derecha = generarDatosPreview({
      columnas: [
        { nombre: "id", tipo: "INT64" },
        { nombre: "ventas", tipo: "NUMERIC" },
      ],
      cantidadFilas: 3,
      semilla: "derecha",
      clavesJoin: ["id"],
    });

    expect(izquierda.filas.map((fila) => fila[0])).toEqual(
      derecha.filas.map((fila) => fila[0]),
    );
    expect(izquierda.filas.map((fila) => fila[0])).toEqual([
      "1001",
      "1002",
      "1003",
    ]);
  });

  it("produce valores visualmente útiles por nombres de negocio genéricos", () => {
    const resultado = generarDatosPreview({
      columnas: [
        { nombre: "Bodega" },
        { nombre: "Sub_bodega" },
        { nombre: "División" },
        { nombre: "Departamento" },
        { nombre: "Proveedor" },
        { nombre: "Zona" },
        { nombre: "Formato" },
        { nombre: "Cod_Ref" },
        { nombre: "Unidad_Operativa" },
        { nombre: "Neto Venta" },
        { nombre: "COSTOTOTAL" },
        { nombre: "PRECIO_PVP" },
        { nombre: "DISPONIBLECAJAS" },
        { nombre: "INVENTARIO_INI" },
        { nombre: "NUM_UNIDADES" },
      ],
      cantidadFilas: 1,
      semilla: "heuristicas",
    });

    expect(resultado.filas[0]).toEqual([
      "Bodega 01",
      "Sub bodega 01",
      "División A",
      "Departamento Ejemplo",
      "Proveedor Ejemplo",
      "Zona A",
      "Formato Ejemplo",
      "REF-1001",
      "Unidad Operativa 01",
      "26.40",
      "18.75",
      "26.40",
      "24",
      "24",
      "24",
    ]);
  });
});
