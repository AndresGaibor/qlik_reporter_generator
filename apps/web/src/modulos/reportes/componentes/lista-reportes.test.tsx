import { expect, test } from "vitest";
import { ListaReportes } from "./lista-reportes";

test("muestra nombre y enlace del reporte local", () => {
  const reporte = {
    id: "11111111-1111-4111-8111-111111111111",
    nombre: "Reporte Ventas",
    flujoIdQlik: "df-1",
    flujoNombreSnapshot: "Ventas",
    flujoEspacioIdQlik: null,
    destinoGcs: "gs://bucket/",
    activa: true,
    creadoPorUsuarioId: "22222222-2222-4222-8222-222222222222",
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
