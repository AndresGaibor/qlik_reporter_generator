import { describe, expect, it, vi } from "bun:test";
import type { PuertoQlik } from "../../../qlik/publico.js";
import { ConsultarPanelAutomatizaciones } from "./consultar-panel.js";

describe("ConsultarPanelAutomatizaciones", () => {
  it("envía el espacio dentro del parámetro filter de Qlik", async () => {
    const listarAutomatizaciones = vi.fn(async () => []);
    const qlik = {
      listarAutomatizaciones,
      listarEspacios: vi.fn(async () => []),
      obtenerUsuario: vi.fn(),
    } as unknown as PuertoQlik;

    await new ConsultarPanelAutomatizaciones(qlik).listar(
      "6a6117b1ffa636f798b792b7",
    );

    expect(listarAutomatizaciones).toHaveBeenCalledWith({
      limit: 200,
      sort: "-updatedAt",
      filter: 'spaceId eq "6a6117b1ffa636f798b792b7"',
    });
  });
});
