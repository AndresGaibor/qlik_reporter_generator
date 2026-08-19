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
