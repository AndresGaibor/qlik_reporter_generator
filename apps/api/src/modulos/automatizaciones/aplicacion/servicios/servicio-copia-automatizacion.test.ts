import { describe, expect, it, vi } from "bun:test";
import type { ServicioQlik } from "../../../qlik/aplicacion/puertos/puerto-qlik.js";
import { copiarAutomatizacion } from "./servicio-copia-automatizacion.js";

describe("copiarAutomatizacion para reportes Dataflow", () => {
  it("no lee STORE/SFTP y elimina schedules directos de Qlik", async () => {
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
        workspace: {
          variables: [
            { name: "Appid", value: "anterior" },
            { name: "Dataset", value: "NO_CAMBIAR" },
            { name: "ArchivoEntrada", value: "NO_CAMBIAR" },
          ],
          blocks: [],
        },
        description: "",
        maxConcurrentRuns: 2,
      })),
      actualizarAutomatizacion,
      obtenerScriptApp,
    } as unknown as ServicioQlik;

    await copiarAutomatizacion(qlik, {
      nombre: "Reporte",
      plantillaIdQlik: "base-1",
      flujoId: "dataflow-actual",
      reemplazosWorkspace: [],
    });

    expect(obtenerScriptApp).not.toHaveBeenCalled();
    expect(actualizarAutomatizacion).toHaveBeenCalledWith(
      "copia-1",
      expect.objectContaining({
        schedules: [],
        workspace: expect.objectContaining({
          variables: expect.arrayContaining([
            expect.objectContaining({
              name: "Appid",
              value: "dataflow-actual",
            }),
            expect.objectContaining({ name: "Dataset", value: "NO_CAMBIAR" }),
            expect.objectContaining({
              name: "ArchivoEntrada",
              value: "NO_CAMBIAR",
            }),
          ]),
        }),
      }),
    );
  });
});
