import { describe, expect, it } from "bun:test";
import { mapearTenantParaAutomatizaciones } from "./consulta-tenant-qlik-postgres.js";

describe("mapearTenantParaAutomatizaciones", () => {
  it("no propaga secretos de destino a automatizaciones", () => {
    const tenant = mapearTenantParaAutomatizaciones({
      host: "empresa.us.qlikcloud.com",
      automatizacionBaseIdQlik: "base-1",
      automatizacionBaseNombre: "Base",
      destinoApiUrl: "https://destino.empresa.test",
      destinoApiKey: "secreto-plano-heredado",
      destinoApiKeyCifrada: "secreto-cifrado",
    });

    expect(tenant).toEqual({
      host: "empresa.us.qlikcloud.com",
      automatizacionBaseIdQlik: "base-1",
      automatizacionBaseNombre: "Base",
      destinoApiUrl: "https://destino.empresa.test",
    });
  });
});
