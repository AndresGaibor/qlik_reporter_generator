import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import { preflightDataflowReporte } from "./api";

afterEach(() => vi.restoreAllMocks());

test("preflightDataflowReporte usa el endpoint server-side del Dataflow", async () => {
  const get = vi
    .spyOn(clienteApi, "get")
    .mockResolvedValue({ compatible: true });

  await preflightDataflowReporte("flujo con espacio");

  expect(get).toHaveBeenCalledWith(
    "/reportes/dataflows/flujo%20con%20espacio/preflight",
  );
});
