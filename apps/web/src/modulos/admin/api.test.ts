import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import { listarAutomatizacionesParaAdmin } from "./api";

afterEach(() => vi.restoreAllMocks());

test("lista automatizaciones técnicas fuera de la API local de reportes", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);

  await listarAutomatizacionesParaAdmin();

  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones", {
    parametros: { incluirBase: "true" },
  });
});
