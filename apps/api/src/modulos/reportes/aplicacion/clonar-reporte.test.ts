import { describe, expect, it, vi } from "bun:test";
import { ClonarReporte } from "./clonar-reporte.js";

describe("ClonarReporte", () => {
  it("autoriza el origen y crea una fila local con el mismo Dataflow", async () => {
    const origen = {
      id: "reporte-1",
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-1",
      nombre: "Ventas",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas actual",
      flujoEspacioIdQlik: "space-1",
      estado: "activa" as const,
    };
    const obtenerPorId = vi.fn(async () => origen);
    const crearReporte = vi.fn(async (entrada: Record<string, unknown>) => ({
      id: "reporte-2",
      ...entrada,
    }));

    const clonado = await new ClonarReporte({
      obtenerPorId,
      crearReporte,
    } as never).ejecutar("reporte-1", "Ventas copia", {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-2",
    });

    expect(obtenerPorId).toHaveBeenCalledWith("reporte-1", "tenant-1", "org-1");
    expect(crearReporte).toHaveBeenCalledWith({
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      creadoPorUsuarioId: "user-2",
      nombre: "Ventas copia",
      flujoIdQlik: "df-1",
      flujoNombreSnapshot: "Ventas actual",
      flujoEspacioIdQlik: "space-1",
      estado: "activa",
    });
    expect(clonado.id).toBe("reporte-2");
  });

  it("rechaza el clon cuando el origen no pertenece al contexto", async () => {
    const crearReporte = vi.fn();
    await expect(
      new ClonarReporte({
        obtenerPorId: vi.fn(async () => null),
        crearReporte,
      } as never).ejecutar("reporte-1", "Copia", {
        tenantId: "tenant-2",
        organizacionId: "org-2",
        usuarioId: "user-2",
      }),
    ).rejects.toMatchObject({ codigo: "REPORTE_NO_ENCONTRADO" });
    expect(crearReporte).not.toHaveBeenCalled();
  });
});
