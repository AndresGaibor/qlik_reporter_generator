import { describe, expect, it } from "bun:test";
import { esquemaTenantQlik } from "./index.js";

const tenantValido = {
  id: "tenant-1",
  organizacionId: "org-1",
  tenantIdQlik: "qlik-tenant-1",
  host: "host.qlik.com",
  nombre: "Test Tenant",
  estado: "activo" as const,
  esPrincipal: true,
  automatizacionBaseIdQlik: "auto-1",
  automatizacionBaseNombre: "Auto Test",
  dataflowBaseIdQlik: "flow-1",
  dataflowBaseNombre: "Dataflow Test",
  dataflowPlantillas: [
    { id: "flow-1", nombre: "Dataflow Test" },
    { id: "flow-2", nombre: "Dataflow Inventario" },
  ],
  destinoApiUrl: null,
  tieneDestinoApiKey: false,
  destinoApiKeyMascara: null,
  destinoBaseDatos: null,
  creadoEn: new Date().toISOString(),
};

describe("admin/index - esquemaTenantQlik", () => {
  it("no debe tener destinoApiUrl en el esquema", () => {
    const resultado = esquemaTenantQlik.safeParse(tenantValido);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).not.toHaveProperty("destinoApiUrl");
    }
  });

  it("no debe tener destinoBaseDatos en el esquema", () => {
    const resultado = esquemaTenantQlik.safeParse(tenantValido);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).not.toHaveProperty("destinoBaseDatos");
    }
  });

  it("debe mantener automatizacionBaseIdQlik y automatizacionBaseNombre", () => {
    const resultado = esquemaTenantQlik.safeParse(tenantValido);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).toHaveProperty("automatizacionBaseIdQlik");
      expect(resultado.data).toHaveProperty("automatizacionBaseNombre");
    }
  });

  it("debe mantener la configuracion del Dataflow base", () => {
    const resultado = esquemaTenantQlik.safeParse(tenantValido);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.dataflowBaseIdQlik).toBe("flow-1");
      expect(resultado.data.dataflowBaseNombre).toBe("Dataflow Test");
      expect(resultado.data.dataflowPlantillas).toHaveLength(2);
    }
  });
});
