import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import {
  actualizarReporte,
  clonarReporte,
  crearReporte,
  ejecutarReporte,
  obtenerAutomatizaciones,
  obtenerAutomatizacionesConFiltros,
  obtenerEjecucionesReporte,
  obtenerReporte,
  obtenerReportes,
  obtenerWorkspaceAutomatizacion,
  preflightDataflowReporte,
} from "./api";

afterEach(() => vi.restoreAllMocks());

test("obtenerReportes es la fuente del catálogo local", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);
  await obtenerReportes();
  expect(get).toHaveBeenCalledWith("/reportes");
});

test("usa URLs y cuerpos canónicos de reportes sin IDs de Automate", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});
  const post = vi.spyOn(clienteApi, "post").mockResolvedValue({ id: "r-2" });
  const put = vi.spyOn(clienteApi, "put").mockResolvedValue({});

  await obtenerReporte("r 1");
  await crearReporte({
    nombre: "Ventas",
    flujoIdQlik: "df-1",
    espacioIdQlik: "sp-1",
  });
  await actualizarReporte("r 1", { nombre: "Ventas 2", flujoIdQlik: "df-2" });
  await clonarReporte("r 1", { nombre: "Copia" });
  await obtenerEjecucionesReporte("r 1");
  await ejecutarReporte("r 1");

  expect(get).toHaveBeenCalledWith("/reportes/r%201");
  expect(put).toHaveBeenCalledWith("/reportes/r%201", {
    nombre: "Ventas 2",
    flujoIdQlik: "df-2",
  });
  expect(post).toHaveBeenCalledWith("/reportes", {
    nombre: "Ventas",
    flujoIdQlik: "df-1",
    espacioIdQlik: "sp-1",
  });
  expect(post).toHaveBeenCalledWith("/reportes/r%201/clonar", {
    nombre: "Copia",
  });
  expect(get).toHaveBeenCalledWith("/reportes/r%201/ejecuciones");
  expect(post).toHaveBeenCalledWith("/reportes/r%201/ejecuciones");
  for (const llamada of [...post.mock.calls, ...put.mock.calls]) {
    expect(JSON.stringify(llamada)).not.toMatch(
      /automatizacion|plantilla|worker/i,
    );
  }
});

test("preflightDataflowReporte usa el endpoint server-side del Dataflow", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue({});
  await preflightDataflowReporte("flujo con espacio");
  expect(get).toHaveBeenCalledWith(
    "/reportes/dataflows/flujo%20con%20espacio/preflight",
  );
});

test("los helpers de compatibilidad consultan la ruta técnica de Qlik", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);

  await obtenerAutomatizaciones();
  await obtenerAutomatizacionesConFiltros("space-1", "ventas");
  await obtenerWorkspaceAutomatizacion("auto 1");

  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones");
  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones", {
    parametros: { espacioId: "space-1", q: "ventas" },
  });
  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones/auto%201/workspace");
});
