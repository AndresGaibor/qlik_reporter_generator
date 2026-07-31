import { describe, expect, it } from "vitest";
import {
  nombreVisibleEntornoQlik,
  normalizarHostQlik,
  urlEntornoQlik,
} from "./utiles-presentacion-qlik";

describe("presentación de entornos Qlik", () => {
  it("elimina protocolo y barras del host", () => {
    expect(normalizarHostQlik("https://empresa.us.qlikcloud.com/")).toBe(
      "empresa.us.qlikcloud.com",
    );
    expect(urlEntornoQlik("empresa.us.qlikcloud.com/")).toBe(
      "https://empresa.us.qlikcloud.com",
    );
  });

  it("reemplaza nombres técnicos por un alias humano", () => {
    expect(
      nombreVisibleEntornoQlik({
        nombre: "https://empresa.us.qlikcloud.com",
        host: "empresa.us.qlikcloud.com",
        esPrincipal: true,
      }),
    ).toBe("Entorno principal");
    expect(
      nombreVisibleEntornoQlik({
        nombre: "Producción",
        host: "empresa.us.qlikcloud.com",
        esPrincipal: true,
      }),
    ).toBe("Producción");
  });
});
