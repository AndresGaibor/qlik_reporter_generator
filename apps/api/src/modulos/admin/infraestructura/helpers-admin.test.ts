import { describe, expect, it } from "bun:test";
import { mapearTenantQlik } from "./helpers-admin.js";

describe("mapearTenantQlik", () => {
  it("oculta los secretos y solo expone indicadores y máscaras", () => {
    const tenant = mapearTenantQlik({
      id: "tenant-1",
      organizacionId: "org-1",
      tenantIdQlik: "qlik-1",
      host: "empresa.us.qlikcloud.com",
      nombre: null,
      estado: "activo",
      esPrincipal: true,
      automatizacionBaseIdQlik: null,
      automatizacionBaseNombre: null,
      destinoApiUrl: "https://destino.empresa.test",
      destinoApiKeyCifrada: '{\\"cifrado\\":\\"...\\"}',
      destinoBaseDatos: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    } as never);

    expect(tenant).toMatchObject({
      tieneDestinoApiKey: true,
      destinoApiKeyMascara: "••••••••",
    });
    expect(tenant).not.toHaveProperty("destinoApiKeyCifrada");
  });
});
