import { describe, expect, it } from "bun:test";
import {
  esquemaDetalleEjecucionReporte,
  esquemaResumenReporte,
} from "./dataflow.js";

describe("contratos de reportes Dataflow", () => {
  it("representa el catálogo Qlik sin estado local", () => {
    const resultado = esquemaResumenReporte.parse({
      id: "df-1",
      nombre: "Ventas",
      espacioId: "sp-1",
      espacioNombre: "Comercial",
      modificadoEn: "2026-08-19T00:00:00.000Z",
      creadoEn: "2026-08-10T00:00:00.000Z",
      ultimaEjecucionEn: "2026-08-20T12:00:00.000Z",
    });

    expect(resultado.creadoEn).toBe("2026-08-10T00:00:00.000Z");
    expect(resultado.ultimaEjecucionEn).toBe("2026-08-20T12:00:00.000Z");
    expect(resultado).not.toHaveProperty("activa");
  });

  it("no acepta ejecuciones que dependan de reporteId local", () => {
    expect(
      esquemaDetalleEjecucionReporte.safeParse({
        id: crypto.randomUUID(),
        reporteId: crypto.randomUUID(),
        flujoIdQlik: "df-1",
      }).success,
    ).toBe(false);
  });
});
