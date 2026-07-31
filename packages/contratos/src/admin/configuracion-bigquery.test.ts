import { describe, expect, it } from "bun:test";
import {
  esquemaConfiguracionBigQuery,
  esquemaConfigurarBigQuery,
  esquemaCredencialesBigQuery,
} from "./index.js";

const credenciales = {
  type: "service_account",
  project_id: "poc-bigquery-talend",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "sa@example.iam.gserviceaccount.com",
};

describe("configuración BigQuery", () => {
  it("acepta una cuenta de servicio y un dataset", () => {
    expect(esquemaCredencialesBigQuery.parse(credenciales).project_id).toBe(
      "poc-bigquery-talend",
    );
    expect(
      esquemaConfigurarBigQuery.parse({
        dataset: "demo_lafavorita",
        credencialesJson: JSON.stringify(credenciales),
      }).dataset,
    ).toBe("demo_lafavorita");
  });

  it("rechaza credenciales que no son service_account", () => {
    expect(() =>
      esquemaCredencialesBigQuery.parse({ ...credenciales, type: "user" }),
    ).toThrow();
  });

  it("la respuesta pública no contiene la clave privada", () => {
    const salida = esquemaConfiguracionBigQuery.parse({
      configurada: true,
      id: "conexion-1",
      estado: "activo",
      projectId: "poc-bigquery-talend",
      dataset: "demo_lafavorita",
      clientEmail: "sa@example.iam.gserviceaccount.com",
      credencialesConfiguradas: true,
      mensajeError: null,
    });

    expect(salida.credencialesConfiguradas).toBe(true);
    expect("privateKey" in salida).toBe(false);
    expect("credencialesJson" in salida).toBe(false);
  });
});