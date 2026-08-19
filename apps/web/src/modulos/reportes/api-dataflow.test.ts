import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import {
  actualizarConfiguracionReporte,
  obtenerConfiguracionReporte,
  obtenerConfiguracionTenant,
  obtenerEjecucionesLocalesReporte,
  preflightDataflowReporte,
} from "./api";

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

test("usa endpoints locales de configuración y auditoría", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});
  const put = vi.spyOn(clienteApi, "put").mockResolvedValue({});

  await obtenerConfiguracionReporte("auto 1");
  await obtenerEjecucionesLocalesReporte("auto 1");
  await actualizarConfiguracionReporte("auto 1", { nombre: "Ventas v2" });

  expect(get).toHaveBeenCalledWith("/reportes/auto%201/configuracion");
  expect(get).toHaveBeenCalledWith("/reportes/auto%201/ejecuciones-locales");
  expect(put).toHaveBeenCalledWith("/reportes/auto%201/configuracion", {
    nombre: "Ventas v2",
  });
});

test("obtiene la configuración tenant desde el endpoint técnico", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});

  await obtenerConfiguracionTenant();

  expect(get).toHaveBeenCalledWith(
    "/qlik/automatizaciones/configuracion-tenant",
  );
});
