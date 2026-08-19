import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { EstadoPreflight } from "./estado-preflight";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

test("destaca datos, costo estimado y advertencia para una consulta costosa", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <EstadoPreflight
        validando={false}
        preflight={{
          flujoIdQlik: "df-1",
          hashDataflowSha256: "a".repeat(64),
          compatible: true,
          operacionesNoSoportadas: [],
          sqlBigQuery: "SELECT * FROM `p.d.t`",
          bytesProcesados: 429271358151,
          costoEstimadoUsd: 2.4401251616,
          validacionBigQuery: { exitosa: true, mensajeError: null },
          resumen: { fuentes: 1, filtros: 1, joins: 0, camposSalida: 15 },
        }}
      />,
    );
  });

  expect(container.textContent).toContain("Datos a procesar");
  expect(container.textContent).toContain("399.79 GiB");
  expect(container.textContent).toContain("Costo estimado");
  expect(container.textContent).toContain("$2.44 USD");
  expect(container.textContent).toContain("Esta ejecución podría procesar");
});

test("permite ver y copiar el SQL generado", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const sql = "SELECT campo FROM `p.d.t` WHERE Fecha = DATE '2026-06-01'";

  act(() => {
    root?.render(
      <EstadoPreflight
        validando={false}
        preflight={{
          flujoIdQlik: "df-1",
          hashDataflowSha256: "b".repeat(64),
          compatible: true,
          operacionesNoSoportadas: [],
          sqlBigQuery: sql,
          bytesProcesados: 1024,
          costoEstimadoUsd: 0.001,
          validacionBigQuery: { exitosa: true, mensajeError: null },
          resumen: { fuentes: 1, filtros: 1, joins: 0, camposSalida: 1 },
        }}
      />,
    );
  });

  expect(container.textContent).toContain("SQL generado");
  const copiar = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Copiar SQL"),
  );
  expect(copiar).toBeDefined();
  await act(async () => copiar?.click());
  expect(writeText).toHaveBeenCalledWith(sql);
});

test("muestra el SQL aunque BigQuery no pueda estimar costo por permisos", () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const sql =
    "SELECT * FROM `poc-bigquery-talend.demo_lafavorita.VENTAS_COMERCIAL_DIARIAS_D`";

  act(() => {
    root?.render(
      <EstadoPreflight
        validando={false}
        preflight={{
          flujoIdQlik: "df-iam",
          hashDataflowSha256: "c".repeat(64),
          compatible: true,
          operacionesNoSoportadas: [],
          sqlBigQuery: sql,
          bytesProcesados: 0,
          costoEstimadoUsd: 0,
          validacionBigQuery: {
            exitosa: false,
            mensajeError:
              "Access Denied: Table poc-bigquery-talend:demo_lafavorita.VENTAS_COMERCIAL_DIARIAS_D",
          },
          resumen: { fuentes: 1, filtros: 1, joins: 0, camposSalida: 15 },
        }}
      />,
    );
  });

  expect(container.textContent).toContain("SQL generado");
  expect(container.textContent).toContain("VENTAS_COMERCIAL_DIARIAS_D");
  expect(container.textContent).toContain("Costo estimado");
  expect(container.textContent).toContain("No disponible");
  expect(container.textContent).toContain("No se pudo validar en BigQuery");
  expect(container.textContent).toContain("Access Denied");
});
