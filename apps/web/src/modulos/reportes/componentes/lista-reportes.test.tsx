import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ListaReportes } from "./lista-reportes";

test("muestra nombre y enlace del Dataflow como reporte", () => {
  const reporte = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Reporte Ventas",
    espacioId: "sp-1",
    espacioNombre: "Ventas",
    modificadoEn: "2026-08-18T12:00:00Z",
  };
  expect(
    ListaReportes({
      reportes: [reporte],
      idEjecutando: null,
      onEjecutar: () => {},
      hayFiltros: false,
    }),
  ).toBeTruthy();
});

test("usa acciones sobrias y una fecha empresarial legible", () => {
  const html = renderToStaticMarkup(
    ListaReportes({
      reportes: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          nombre: "Ventas",
          espacioId: "sp-1",
          espacioNombre: "Comercial",
          modificadoEn: "2026-08-18T15:41:58Z",
        },
      ],
      idEjecutando: null,
      onEjecutar: () => {},
      hayFiltros: false,
    }),
  );
  expect(html).toContain("Modificado");
  expect(html).toContain("Ejecutar");
  expect(html).not.toContain("Ejecutar reporte");
  expect(html).not.toContain(":58");
});
