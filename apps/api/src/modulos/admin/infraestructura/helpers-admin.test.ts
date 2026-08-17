import { describe, expect, it } from "bun:test";
import { mapearTenantQlik } from "./helpers-admin.js";

describe("mapearTenantQlik", () => {
  it("expone campos publicos del tenant sin secretos de destino", () => {
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
      destinoApiKeyCifrada: '{"cifrado":"..."}',
      destinoBaseDatos: null,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    } as never);

    expect(tenant).toMatchObject({
      id: "tenant-1",
      organizacionId: "org-1",
      tenantIdQlik: "qlik-1",
      host: "empresa.us.qlikcloud.com",
      estado: "activo",
      esPrincipal: true,
      automatizacionBaseIdQlik: null,
      automatizacionBaseNombre: null,
    });
    expect(tenant).not.toHaveProperty("destinoApiUrl");
    expect(tenant).not.toHaveProperty("destinoApiKeyCifrada");
    expect(tenant).not.toHaveProperty("destinoBaseDatos");
    expect(tenant).not.toHaveProperty("tieneDestinoApiKey");
    expect(tenant).not.toHaveProperty("destinoApiKeyMascara");
  });
});
