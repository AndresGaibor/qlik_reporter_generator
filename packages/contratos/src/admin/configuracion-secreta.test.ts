import { describe, expect, it } from "bun:test";
import { esquemaConfigurarDestinoTenant } from "./index.js";

describe("contratos de configuración secreta", () => {
  it("permite editar un destino sin reenviar su API key", () => {
    expect(
      esquemaConfigurarDestinoTenant.safeParse({
        destinoApiUrl: "https://destino.empresa.test",
        destinoApiKey: "",
      }).success,
    ).toBe(true);
  });
});
