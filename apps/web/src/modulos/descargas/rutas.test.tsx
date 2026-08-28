import { expect, test } from "vitest";
import { PaginaDescargas } from "./pagina-descargas";
import { crearRutasDescargas } from "./rutas";

test("la ruta principal conserva la experiencia de descargas normalizadas y compartidas", () => {
  const [rutaPrincipal] = crearRutasDescargas({} as never);

  expect(rutaPrincipal.options.component).toBe(PaginaDescargas);
});
