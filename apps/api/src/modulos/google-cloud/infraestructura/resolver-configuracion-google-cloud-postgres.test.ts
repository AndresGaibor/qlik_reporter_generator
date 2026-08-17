import { describe, expect, it, vi } from "bun:test";
import { ResolverConfiguracionGoogleCloudPostgres } from "./resolver-configuracion-google-cloud-postgres.js";

vi.mock(
  "../../../plataforma/seguridad/servicio-cifrado.js",
  () => ({
    servicioCifrado: {
      descifrar: vi.fn(() => '{"type":"service_account"}'),
    },
  }),
);

describe("ResolverConfiguracionGoogleCloudPostgres", () => {
  it("devuelve projectId, dataset y credencialesJson descifradas con secretoRefs", async () => {
    const mockDb = {
      query: {
        conexionesDestino: {
          findFirst: vi.fn(async () => ({
            id: "conn-1",
            organizacionId: "org-1",
            tenantQlikId: "tenant-1",
            tipo: "bigquery",
            nombre: "BigQuery principal",
            config: {
              projectId: "proyecto-test",
              dataset: "dataset_test",
            },
            secretoRefs: {
              credencialesJson: {
                cifrado: "abc",
                iv: "def",
                tag: "ghi",
              },
              otroSecreto: "valor",
            },
            esPredeterminada: true,
          })),
        },
      },
    };

    const resolver = new ResolverConfiguracionGoogleCloudPostgres(
      mockDb as never,
    );

    const resultado = await resolver.resolver("org-1", "tenant-1");

    expect(resultado.projectId).toBe("proyecto-test");
    expect(resultado.dataset).toBe("dataset_test");
    expect(resultado.credencialesJson).toBe('{"type":"service_account"}');
    expect(resultado.secretoRefs).toEqual({
      credencialesJson: {
        cifrado: "abc",
        iv: "def",
        tag: "ghi",
      },
      otroSecreto: "valor",
    });
  });

  it("devuelve secretoRefs original cuando credencialesJson está ausente", async () => {
    const mockDb = {
      query: {
        conexionesDestino: {
          findFirst: vi.fn(async () => ({
            id: "conn-1",
            organizacionId: "org-1",
            tenantQlikId: "tenant-1",
            tipo: "bigquery",
            nombre: "BigQuery principal",
            config: {
              projectId: "proyecto-test",
              dataset: "dataset_test",
            },
            secretoRefs: {
              otroSecreto: "valor",
            },
            esPredeterminada: true,
          })),
        },
      },
    };

    const resolver = new ResolverConfiguracionGoogleCloudPostgres(
      mockDb as never,
    );

    const resultado = await resolver.resolver("org-1", "tenant-1");

    expect(resultado.credencialesJson).toBe("");
    expect(resultado.secretoRefs).toEqual({ otroSecreto: "valor" });
  });

  it("lanza error cuando no existe conexión bigquery", async () => {
    const mockDb = {
      query: {
        conexionesDestino: {
          findFirst: vi.fn(async () => null),
        },
      },
    };

    const resolver = new ResolverConfiguracionGoogleCloudPostgres(
      mockDb as never,
    );

    await expect(resolver.resolver("org-1", "tenant-1")).rejects.toMatchObject({
      codigo: "GOOGLE_CLOUD_NO_CONFIGURADO",
    });
  });

  it("lanza error cuando falta projectId o dataset", async () => {
    const mockDb = {
      query: {
        conexionesDestino: {
          findFirst: vi.fn(async () => ({
            id: "conn-1",
            organizacionId: "org-1",
            tenantQlikId: "tenant-1",
            tipo: "bigquery",
            nombre: "BigQuery principal",
            config: {
              projectId: "",
              dataset: "",
            },
            secretoRefs: {},
            esPredeterminada: true,
          })),
        },
      },
    };

    const resolver = new ResolverConfiguracionGoogleCloudPostgres(
      mockDb as never,
    );

    await expect(resolver.resolver("org-1", "tenant-1")).rejects.toMatchObject({
      codigo: "GOOGLE_CLOUD_INCOMPLETO",
    });
  });
});
