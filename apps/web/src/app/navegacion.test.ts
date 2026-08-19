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

test("integra Dataflows en Reportes y no conserva el item legacy", () => {
  expect(NAVEGACION.some((item) => String(item.to) === "/flujos")).toBe(false);
  expect(NAVEGACION.some((item) => item.to === "/reportes")).toBe(true);
});

test("no conserva la navegación legacy de Resultados BigQuery", () => {
  expect(NAVEGACION.some((item) => String(item.to) === "/tablas")).toBe(false);
  expect(NAVEGACION.some((item) => item.etiqueta === "Resultados")).toBe(false);
});
