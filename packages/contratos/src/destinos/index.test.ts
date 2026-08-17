import { describe, expect, it } from "bun:test";
import { esquemaTipoDestino, esquemaRecursoDestino } from "./index.js";

describe("destinos/index", () => {
  it("esquemaTipoDestino solo debe aceptar bigquery", () => {
    const resultado = esquemaTipoDestino.safeParse("bigquery");
    expect(resultado.success).toBe(true);
  });

  it("esquemaTipoDestino no debe aceptar postgres", () => {
    const resultado = esquemaTipoDestino.safeParse("postgres");
    expect(resultado.success).toBe(false);
  });

  it("esquemaTipoDestino no debe aceptar sftp", () => {
    const resultado = esquemaTipoDestino.safeParse("sftp");
    expect(resultado.success).toBe(false);
  });

  it("esquemaRecursoDestino.tipo solo debe aceptar tabla o dataset", () => {
    const tabla = esquemaRecursoDestino.safeParse({
      id: "1",
      nombre: "test",
      tipo: "tabla",
    });
    expect(tabla.success).toBe(true);

    const dataset = esquemaRecursoDestino.safeParse({
      id: "1",
      nombre: "test",
      tipo: "dataset",
    });
    expect(dataset.success).toBe(true);

    const archivo = esquemaRecursoDestino.safeParse({
      id: "1",
      nombre: "test",
      tipo: "archivo",
    });
    expect(archivo.success).toBe(false);

    const carpeta = esquemaRecursoDestino.safeParse({
      id: "1",
      nombre: "test",
      tipo: "carpeta",
    });
    expect(carpeta.success).toBe(false);
  });
});
