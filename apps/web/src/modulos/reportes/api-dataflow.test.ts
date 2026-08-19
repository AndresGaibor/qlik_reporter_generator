import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import {
  crearReporteDesdePlantilla,
  ejecutarReporte,
  obtenerAutomatizaciones,
  obtenerDataflowBaseReporte,
  obtenerEjecucionesReporte,
  obtenerReporte,
  obtenerReportes,
  preflightDataflowReporte,
} from "./api";

afterEach(() => vi.restoreAllMocks());

test("obtenerReportes consulta el catálogo Qlik canónico", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);
  await obtenerReportes();
  expect(get).toHaveBeenCalledWith("/reportes");
});

test("usa el ID Qlik para detalle, historial y ejecución", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});
  const post = vi.spyOn(clienteApi, "post").mockResolvedValue({ id: "r-2" });

  await obtenerReporte("df 1");
  await obtenerEjecucionesReporte("df 1");
  await ejecutarReporte("df 1");
  await obtenerDataflowBaseReporte();
  await crearReporteDesdePlantilla("Ventas");

  expect(get).toHaveBeenCalledWith("/reportes/df%201");
  expect(get).toHaveBeenCalledWith("/reportes/df%201/ejecuciones");
  expect(post).toHaveBeenCalledWith("/reportes/df%201/ejecuciones");
  expect(get).toHaveBeenCalledWith("/reportes/plantilla-base");
  expect(post).toHaveBeenCalledWith("/reportes/desde-plantilla", {
    nombre: "Ventas",
  });
});

test("preflightDataflowReporte usa el endpoint server-side del Dataflow", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});
  await preflightDataflowReporte("flujo con espacio");
  expect(get).toHaveBeenCalledWith("/reportes/flujo%20con%20espacio/preflight");
});

test("los helpers técnicos consultan la ruta técnica de Qlik", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);

  await obtenerAutomatizaciones();
  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones");
});
