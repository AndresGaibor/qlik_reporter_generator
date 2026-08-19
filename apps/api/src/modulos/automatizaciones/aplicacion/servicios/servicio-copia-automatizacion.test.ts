import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import {
  copiarAutomatizacion,
  copiarAutomatizacionPersonal,
} from "./servicio-copia-automatizacion.js";

async function workspaceTalend(): Promise<Record<string, unknown>> {
  const fixture = new URL(
    "../../../reportes/fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

describe("copiarAutomatizacion para reportes Dataflow", () => {
  it("acepta la plantilla Prueba_BigQuery, no lee STORE y fuerza schedules vacíos", async () => {
    const obtenerScriptApp = vi.fn(async () => ({
      script: "STORE [x] INTO [lib://SFTP//upload/legacy.csv] (txt);",
    }));
    const actualizarAutomatizacion = vi.fn(async (_id, definicion) => ({
      id: "copia-1",
      name: "Reporte",
      ...definicion,
    }));
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "copia-1" })),
      cambiarEspacioAutomatizacion: vi.fn(async () => undefined),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "copia-1",
        name: "Base",
        schedules: [{ cron: "legacy" }],
        workspace: await workspaceTalend(),
        description: "",
        maxConcurrentRuns: 2,
      })),
      actualizarAutomatizacion,
      obtenerScriptApp,
    } as unknown as ServicioQlik;

    const resultado = await copiarAutomatizacion(qlik, {
      nombre: "Reporte",
      plantillaIdQlik: "base-1",
      flujoId: "dataflow-actual",
      reemplazosWorkspace: [],
    });

    expect(resultado.error).toBeUndefined();
    expect(obtenerScriptApp).not.toHaveBeenCalled();
    expect(actualizarAutomatizacion).toHaveBeenCalledWith(
      "copia-1",
      expect.objectContaining({ schedules: [], workspace: expect.any(Object) }),
    );
  });

  it("rechaza un clon con el contrato Talend antiguo antes de actualizarlo", async () => {
    const actualizarAutomatizacion = vi.fn(async () => ({}));
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "copia-legacy" })),
      cambiarEspacioAutomatizacion: vi.fn(async () => undefined),
      cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "copia-legacy",
        name: "Legacy",
        workspace: {
          blocks: [
            {
              name: "executeTask",
              type: "EndpointBlock",
              inputs: [
                {
                  mode: "keyValue",
                  value: [{ key: "gcp_tabla", value: "tabla" }],
                },
              ],
            },
          ],
        },
      })),
      actualizarAutomatizacion,
    } as unknown as ServicioQlik;

    const resultado = await copiarAutomatizacion(qlik, {
      nombre: "Reporte",
      plantillaIdQlik: "base-legacy",
      flujoId: "dataflow-actual",
      reemplazosWorkspace: [],
    });

    expect(resultado.error).toBeInstanceOf(Error);
    expect(String((resultado.error as Error).message)).toContain(
      "credenciales",
    );
    expect(actualizarAutomatizacion).not.toHaveBeenCalled();
  });
});

describe("copiarAutomatizacionPersonal", () => {
  it("propaga un fallo al asignar el propietario Qlik", async () => {
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
    ).rejects.toBe(error);
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
