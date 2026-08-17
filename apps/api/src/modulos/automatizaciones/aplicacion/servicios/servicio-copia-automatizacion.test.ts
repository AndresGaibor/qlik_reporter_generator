import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import { copiarAutomatizacion } from "./servicio-copia-automatizacion.js";

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
