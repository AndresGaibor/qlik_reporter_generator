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

test("incluye /flujos en navegación como punto de entrada Dataflows", () => {
  expect(NAVEGACION.some((item) => item.to === "/flujos")).toBe(true);
  const item = NAVEGACION.find((item) => item.to === "/flujos");
  expect(item?.etiqueta).toBe("Dataflows");
});

test("no conserva la navegación legacy de Resultados BigQuery", () => {
  expect(NAVEGACION.some((item) => String(item.to) === "/tablas")).toBe(false);
  expect(NAVEGACION.some((item) => item.etiqueta === "Resultados")).toBe(false);
});
