import { describe, expect, it } from "bun:test";
import { mapearTenantParaAutomatizaciones } from "./consulta-tenant-qlik-postgres.js";

describe("mapearTenantParaAutomatizaciones", () => {
  it("mapea correctamente los campos de tenant para automatizaciones", () => {
    const tenant = mapearTenantParaAutomatizaciones({
      host: "empresa.us.qlikcloud.com",
      automatizacionBaseIdQlik: "base-1",
      automatizacionBaseNombre: "Base",
      dataflowBaseIdQlik: "dataflow-base-1",
      dataflowBaseNombre: "Dataflow Base",
    });

    expect(tenant).toEqual({
      host: "empresa.us.qlikcloud.com",
      automatizacionBaseIdQlik: "base-1",
      automatizacionBaseNombre: "Base",
      dataflowBaseIdQlik: "dataflow-base-1",
      dataflowBaseNombre: "Dataflow Base",
    });
  });
});
