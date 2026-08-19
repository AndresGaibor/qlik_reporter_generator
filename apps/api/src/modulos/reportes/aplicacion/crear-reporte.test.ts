import { describe, expect, it, vi } from "bun:test";
import { CrearReporte } from "./crear-reporte.js";

const contexto = {
  tenantId: "tenant-1",
  organizacionId: "org-1",
  usuarioId: "user-1",
};

describe("CrearReporte", () => {
  it("hace preflight, toma el snapshot del Dataflow y crea solo la fila local", async () => {
    const crearReporte = vi.fn(async (entrada: Record<string, unknown>) => ({
      id: "reporte-1",
      ...entrada,
    }));
    const preflight = vi.fn(async () => ({ compatible: true }));
    const copiarAutomatizacion = vi.fn();
    const qlik = {
      listarFlujos: vi.fn(async () => [
        { id: "df-1", name: "Ventas actual", spaceId: "space-1" },
      ]),
      copiarAutomatizacion,
    };

    const creado = await new CrearReporte(
      qlik as never,
      { ejecutar: preflight },
      { crearReporte } as never,
    ).ejecutar({ nombre: "Ventas", flujoIdQlik: "df-1" }, contexto);

    expect(creado.nombre).toBe("Ventas");
    expect(preflight).toHaveBeenCalledWith("df-1");
    expect(qlik.listarFlujos).toHaveBeenCalledWith(undefined);
    expect(crearReporte).toHaveBeenCalledWith({
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas actual",
      flujoEspacioIdQlik: "space-1",
      estado: "activa",
    });
    expect(copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("rechaza un Dataflow incompatible antes de listar o persistir", async () => {
    const listarFlujos = vi.fn();
    const crearReporte = vi.fn();
    const preflight = vi.fn(async () => ({ compatible: false }));

    await expect(
      new CrearReporte({ listarFlujos } as never, { ejecutar: preflight }, {
        crearReporte,
      } as never).ejecutar({ nombre: "Ventas", flujoIdQlik: "df-1" }, contexto),
    ).rejects.toMatchObject({
      codigo: "DATAFLOW_NO_COMPATIBLE",
      estadoHttp: 422,
    });
    expect(listarFlujos).not.toHaveBeenCalled();
    expect(crearReporte).not.toHaveBeenCalled();
  });

  it("rechaza un Dataflow ausente después del preflight sin persistir", async () => {
    const crearReporte = vi.fn();
    const preflight = vi.fn(async () => ({ compatible: true }));
    const listarFlujos = vi.fn(async () => []);

    await expect(
      new CrearReporte({ listarFlujos } as never, { ejecutar: preflight }, {
        crearReporte,
      } as never).ejecutar({ nombre: "Ventas", flujoIdQlik: "df-1" }, contexto),
    ).rejects.toMatchObject({
      codigo: "DATAFLOW_NO_ENCONTRADO",
      estadoHttp: 404,
    });
    expect(preflight).toHaveBeenCalledWith("df-1");
    expect(crearReporte).not.toHaveBeenCalled();
  });
});
