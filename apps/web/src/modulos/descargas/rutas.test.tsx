import { expect, test } from "vitest";
import { PaginaDescargas } from "./pagina-descargas";
import { crearRutasDescargas } from "./rutas";

test("la ruta principal conserva la experiencia de descargas normalizadas y compartidas", () => {
  const [rutaPrincipal] = crearRutasDescargas({} as never);

  expect(rutaPrincipal.options.component).toBe(PaginaDescargas);
});

test("registra una ruta canónica por id de ejecución", () => {
  const rutas = crearRutasDescargas({} as never);
  const rutaEjecucion = rutas.find(
    (ruta) => ruta.options.path === "/descargas/ejecuciones/$ejecucionId",
  );

  expect(rutaEjecucion).toBeTruthy();
  expect(rutaEjecucion?.options.component).toBe(PaginaDescargas);
});
