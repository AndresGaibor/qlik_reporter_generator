import { describe, expect, it } from "bun:test";
import { ServicioBigQueryAdminPostgres } from "./servicio-bigquery-admin-postgres.js";

describe("ServicioBigQueryAdminPostgres", () => {
  it("usa un millón de filas por archivo antes de la primera configuración", async () => {
    const db = {
      query: {
        conexionesDestino: {
          findFirst: async () => null,
        },
      },
    };
    const cifrado = {
      cifrar: () => ({ cifrado: "", iv: "", tag: "" }),
      descifrar: () => "",
    };
    const servicio = new ServicioBigQueryAdminPostgres(db as never, cifrado);

    await expect(servicio.obtenerBigQuery("org-1", "tenant-1")).resolves.toMatchObject({
      configurada: false,
      credencialesConfiguradas: false,
      maximoFilasPorArchivo: 1_000_000,
    });
  });
});
