import { describe, expect, it } from "bun:test";
import { ConsultaFlujosQlik } from "./consulta-flujos-qlik.js";

describe("ConsultaFlujosQlik", () => {
  it("conserva la fecha de creación entregada por Qlik", async () => {
    const consulta = new ConsultaFlujosQlik({
      listarFlujos: async () => [
        {
          id: "df-1",
          appId: "app-real-1",
          name: "Ventas",
          createdAt: "2026-08-10T09:00:00Z",
          updatedAt: "2026-08-20T09:00:00Z",
        },
      ],
      listarEspacios: async () => [],
    } as never);

    expect(await consulta.listar()).toEqual([
      expect.objectContaining({
        id: "df-1",
        appId: "app-real-1",
        creadoEn: "2026-08-10T09:00:00Z",
        modificadoEn: "2026-08-20T09:00:00Z",
      }),
    ]);
  });
});
