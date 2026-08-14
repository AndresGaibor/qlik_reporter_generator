import { describe, expect, it } from "bun:test";
import { RepositorioReportesPostgres } from "./repositorio-reportes-postgres.js";

const entrada = {
  organizacionId: "11111111-1111-4111-8111-111111111111",
  tenantQlikId: "22222222-2222-4222-8222-222222222222",
  creadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
  nombre: "Ventas",
  flujoIdQlik: "flujo-1",
  flujoNombreSnapshot: "Ventas Dataflow",
  flujoEspacioIdQlik: "espacio-1",
  destinoProveedor: "gcs",
  destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
  destinoNombreSnapshot: "TalendDescargados",
  automatizacionIdQlik: "auto-1",
  automatizacionNombreSnapshot: "Ventas",
  programar: false,
  estado: "activa" as const,
};

describe("RepositorioReportesPostgres", () => {
  it("persiste la asociación Dataflow-Automate-GCS", async () => {
    let valores: unknown;
    const db = {
      insert: () => ({
        values: (entradaInsert: unknown) => {
          valores = entradaInsert;
          return {
            returning: async () => [
              {
                id: "44444444-4444-4444-8444-444444444444",
                ...(entradaInsert as object),
              },
            ],
          };
        },
      }),
      query: { configuracionesAutomatizacion: { findFirst: async () => null } },
    };
    const repo = new RepositorioReportesPostgres(db as never);

    const resultado = await repo.crearConfiguracion(entrada);

    expect(valores).toMatchObject({
      flujoIdQlik: "flujo-1",
      automatizacionIdQlik: "auto-1",
      destinoProveedor: "gcs",
      destinoIdExterno: "gs://bkt_dwh/POCs/TalendDescargados/",
    });
    expect(resultado.id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("resuelve el reporte por tenant y automatización", async () => {
    let consultaRecibida = false;
    const fila = { id: "config-1", ...entrada };
    const db = {
      query: {
        configuracionesAutomatizacion: {
          findFirst: async (opciones: unknown) => {
            consultaRecibida = Boolean(opciones);
            return fila;
          },
        },
      },
    };
    const repo = new RepositorioReportesPostgres(db as never);

    expect(
      await repo.obtenerPorAutomatizacion(entrada.tenantQlikId, "auto-1"),
    ).toEqual(fila);
    expect(consultaRecibida).toBe(true);
  });
});
