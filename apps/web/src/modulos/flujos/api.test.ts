import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import { obtenerEspacios } from "./api";

afterEach(() => vi.restoreAllMocks());

test("obtenerEspacios usa la ruta técnica de espacios de Qlik", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);

  await obtenerEspacios();

  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones/espacios");
});
