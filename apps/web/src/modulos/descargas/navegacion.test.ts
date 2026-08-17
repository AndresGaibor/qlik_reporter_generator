import { describe, expect, it } from "vitest";
import { NAVEGACION } from "@/app/navegacion";

describe("navegacion", () => {
  it("incluye /descargas en navegación", () => {
    expect(NAVEGACION.some((item) => item.to === "/descargas")).toBe(true);
  });

  it("tiene etiqueta Descargas", () => {
    const item = NAVEGACION.find((item) => item.to === "/descargas");
    expect(item?.etiqueta).toBe("Descargas");
  });

  it("usa icono cloud", () => {
    const item = NAVEGACION.find((item) => item.to === "/descargas");
    expect(item?.icono).toBe("cloud");
  });
});
