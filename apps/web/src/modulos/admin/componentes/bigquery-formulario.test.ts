import { describe, expect, it } from "vitest";
import {
  analizarCredencialesBigQuery,
  puedeGuardarBigQuery,
} from "./bigquery-formulario";

const credenciales = JSON.stringify({
  type: "service_account",
  project_id: "poc-bigquery-talend",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "sa@example.iam.gserviceaccount.com",
});

describe("formulario BigQuery", () => {
  it("extrae el proyecto y correo del JSON", () => {
    expect(analizarCredencialesBigQuery(credenciales)).toEqual({
      valido: true,
      projectId: "poc-bigquery-talend",
      clientEmail: "sa@example.iam.gserviceaccount.com",
    });
  });

  it("explica cuando el JSON es inválido", () => {
    const resultado = analizarCredencialesBigQuery("{invalido");
    expect(resultado.valido).toBe(false);
    expect(resultado.error).toContain("JSON");
  });

  it("permite editar sin volver a pegar credenciales guardadas", () => {
    expect(
      puedeGuardarBigQuery({
        dataset: "demo_lafavorita",
        gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
        credencialesJson: "",
        credencialesConfiguradas: true,
      }),
    ).toBe(true);
  });

  it("exige el JSON durante la primera configuración", () => {
    expect(
      puedeGuardarBigQuery({
        dataset: "demo_lafavorita",
        gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
        credencialesJson: "",
        credencialesConfiguradas: false,
      }),
    ).toBe(false);
  });

  it("rechaza una ruta GCS con traversal", () => {
    expect(
      puedeGuardarBigQuery({
        dataset: "demo_lafavorita",
        gcsUri: "gs://otro-bucket/../secreto/",
        credencialesJson: "",
        credencialesConfiguradas: true,
      }),
    ).toBe(false);
  });
});

describe("campos de almacenamiento GCS", () => {
  it("separa bucket y prefijo de la URI configurada", async () => {
    const modulo = await import("./bigquery-formulario");
    expect(
      modulo.separarUriGcs("gs://bkt_dwh/POCs/TalendDescargados/"),
    ).toEqual({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/",
    });
  });

  it("construye la URI desde bucket y prefijo", async () => {
    const modulo = await import("./bigquery-formulario");
    expect(modulo.construirUriGcs("bkt_reportes", "salidas/talend")).toBe(
      "gs://bkt_reportes/salidas/talend/",
    );
  });
});
