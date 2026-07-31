import { expect, test } from "vitest";
import { NAVEGACION } from "./navegacion";

test("la navegación administrativa usa Configuración sin Organizaciones", () => {
  expect(NAVEGACION.some((item) => item.to === "/configuracion")).toBe(true);
  expect(NAVEGACION.some((item) => item.etiqueta === "Organizaciones")).toBe(
    false,
  );
  expect(NAVEGACION.some((item) => String(item.to) === "/admin/tenants")).toBe(
    false,
  );
});
