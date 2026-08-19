import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import { copiarAutomatizacionPersonal } from "./servicio-copia-automatizacion.js";

async function workspaceTalend(): Promise<Record<string, unknown>> {
  const fixture = new URL(
    "../../../reportes/fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("copiarAutomatizacionPersonal", () => {
  it("expone el ID creado cuando falla la asignación del propietario Qlik", async () => {
    const error = new Error("Qlik no permite asignar propietario");
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "worker-owner-error" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => {
        throw error;
      }),
    } as unknown as ServicioQlik;

    await expect(
      copiarAutomatizacionPersonal(qlik, {
        nombre: "Worker personal",
        plantillaIdQlik: "base-1",
        propietarioIdQlik: "owner-1",
      }),
    ).resolves.toMatchObject({ id: "worker-owner-error", error });
  });

  it("no inyecta metadata de reporte y conserva Credenciales", async () => {
    const workspace = await workspaceTalend();
    const actualizarAutomatizacion = vi.fn(async (_id, definicion) => ({
      id: "worker-1",
      ...definicion,
    }));
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "worker-1" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      obtenerAutomatizacion: vi.fn(async () => ({ workspace })),
      actualizarAutomatizacion,
    } as unknown as ServicioQlik;

    const resultado = await copiarAutomatizacionPersonal(qlik, {
      nombre: "Worker personal",
      plantillaIdQlik: "base-1",
      propietarioIdQlik: "user-1",
    });

    expect(resultado.error).toBeUndefined();
    const definicion = actualizarAutomatizacion.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(definicion.schedules).toEqual([]);
    expect(JSON.stringify(definicion.workspace)).toContain(
      "CREDENCIAL_SANITIZADA",
    );
    expect(JSON.stringify(definicion.workspace)).not.toContain("dataflow");
    expect(JSON.stringify(definicion.workspace)).not.toContain("Appid");
    expect(JSON.stringify(definicion.workspace)).not.toContain("autor");
  });

  it("distingue un GET fallido de una copia estructuralmente inválida", async () => {
    const error = new Error("Qlik temporalmente no disponible");
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "worker-1" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      obtenerAutomatizacion: vi.fn(async () => {
        throw error;
      }),
    } as unknown as ServicioQlik;

    const resultado = await copiarAutomatizacionPersonal(qlik, {
      nombre: "Worker personal",
      plantillaIdQlik: "base-1",
    });

    expect(resultado.error).toBe(error);
    expect(resultado.tipoError).toBe("integracion");
    expect(resultado.incompatible).toBe(false);
  });

  it("distingue un PUT fallido de una copia estructuralmente inválida", async () => {
    const error = new Error("Qlik temporalmente no disponible");
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "worker-1" })),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      obtenerAutomatizacion: vi.fn(async () => ({
        workspace: await workspaceTalend(),
      })),
      actualizarAutomatizacion: vi.fn(async () => {
        throw error;
      }),
    } as unknown as ServicioQlik;

    const resultado = await copiarAutomatizacionPersonal(qlik, {
      nombre: "Worker personal",
      plantillaIdQlik: "base-1",
    });

    expect(resultado.error).toBe(error);
    expect(resultado.tipoError).toBe("integracion");
    expect(resultado.incompatible).toBe(false);
  });
});
