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

test("muestra la última ejecución como la actividad que explica el orden", () => {
  const html = renderToStaticMarkup(
    ListaReportes({
      reportes: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          nombre: "Ventas",
          espacioId: "sp-1",
          espacioNombre: "Comercial",
          creadoEn: "2026-08-17T09:00:00Z",
          modificadoEn: "2026-08-18T15:41:58Z",
          ultimaEjecucionEn: "2026-08-20T15:31:00Z",
        },
      ],
      idEjecutando: null,
      onEjecutar: () => {},
      hayFiltros: false,
    }),
  );
  expect(html).toContain("Última actividad");
  expect(html).toContain("Ejecutado");
  expect(html).toContain("20 ago 2026");
  expect(html).not.toContain("18 ago 2026");
  expect(html).toContain("Ejecutar");
  expect(html).not.toContain("Ejecutar reporte");
});

test("usa la fecha de creación cuando el reporte nunca se ha ejecutado", () => {
  const html = renderToStaticMarkup(
    ListaReportes({
      reportes: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          nombre: "Nuevo reporte",
          espacioId: "sp-1",
          espacioNombre: "Comercial",
          creadoEn: "2026-08-19T10:05:00Z",
          modificadoEn: "2026-08-20T12:00:00Z",
          ultimaEjecucionEn: null,
        },
      ],
      idEjecutando: null,
      onEjecutar: () => {},
      hayFiltros: false,
    }),
  );
  expect(html).toContain("Creado");
  expect(html).toContain("19 ago 2026");
  expect(html).not.toContain("20 ago 2026");
});

test("identifica visualmente un Dataflow compartido", () => {
  const html = renderToStaticMarkup(
    ListaReportes({
      reportes: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          nombre: "Inventario compartido",
          espacioId: "sp-1",
          espacioNombre: "Comercial",
          modificadoEn: null,
          compartidoConmigo: true,
        },
      ],
      idEjecutando: null,
      onEjecutar: () => {},
      hayFiltros: false,
    }),
  );
  expect(html).toContain("Compartido contigo");
});
