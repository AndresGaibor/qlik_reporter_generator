import { describe, expect, it } from "bun:test";
import { esquemaCredencialesBigQuery } from "./index.js";

describe("contratos de configuración secreta", () => {
  it("valida credenciales BigQuery con estructura correcta", () => {
    expect(
      esquemaCredencialesBigQuery.safeParse({
        type: "service_account",
        project_id: "mi-proyecto",
        client_email: "svc@mi-proyecto.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\nMIEXAMPLE\n-----END PRIVATE KEY-----\n",
      }).success,
    ).toBe(true);
  });

  it("rechaza credenciales BigQuery sin clave privada válida", () => {
    expect(
      esquemaCredencialesBigQuery.safeParse({
        type: "service_account",
        project_id: "mi-proyecto",
        client_email: "svc@mi-proyecto.iam.gserviceaccount.com",
        private_key: "sin-formato-pem",
      }).success,
    ).toBe(false);
  });
});
