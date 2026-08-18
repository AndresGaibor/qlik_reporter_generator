import type { ResumenReporteDataflow } from "@qlik/contratos/flujos";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PestanaScriptFlujo } from "./pestana-script-flujo";

let root: Root | undefined;
let contenedor: HTMLDivElement | undefined;

afterEach(() => {
  if (root) flushSync(() => root?.unmount());
  contenedor?.remove();
  root = undefined;
  contenedor = undefined;
});

function montar(props: Partial<Parameters<typeof PestanaScriptFlujo>[0]> = {}) {
  contenedor = document.createElement("div");
  document.body.append(contenedor);
  root = createRoot(contenedor);
  flushSync(() => {
    root?.render(
      <PestanaScriptFlujo
        cargando={false}
        actualizando={false}
        onActualizar={vi.fn()}
        {...props}
      />,
    );
  });
  return contenedor;
}

const resumenBase: ResumenReporteDataflow = {
  flujoId: "flujo-1",
  nombre: "Ventas diarias",
  descripcion: "Reporte diario de ventas.",
  fuentePrincipal: {
    nombre: "Ventas",
    tabla: "p.d.ventas",
    dataset: "d",
  },
  tablaDestino: "salida",
  campos: [{ nombreVisible: "Fecha", alias: "Fecha", tipoInferido: "fecha" }],
  filtros: [
    {
      etiqueta: "Fecha desde",
      campo: "Fecha",
      operador: ">=",
      valorPredeterminado: "2026-08-01",
      obligatorio: false,
    },
  ],
  rangoTemporal: {
    campo: "Fecha",
    fechaInicial: "6/1/2026",
    fechaFinal: "6/1/2026",
  },
  estado: "analizado",
  advertencias: [],
  analizadoEn: "2026-08-18T12:00:00.000Z",
};

describe("PestanaScriptFlujo", () => {
  it("muestra el estado cargando", () => {
    expect(montar({ cargando: true }).textContent).toContain(
      "Analizando el reporte actual",
    );
  });

  it("muestra el resumen exitoso sin SQL", () => {
    const vista = montar({ resumen: resumenBase });
    expect(vista.textContent).toContain("Analizado correctamente");
    expect(vista.textContent).toContain("Campos devueltos");
    expect(vista.textContent).toContain("Fecha desde");
    expect(vista.textContent).toContain(
      "El reporte incluirá registros donde Fecha sea igual o posterior a 2026-08-01.",
    );
    expect(vista.textContent).not.toContain("Operador");
    expect(vista.textContent?.indexOf("Rango temporal detectado")).toBeLessThan(
      vista.textContent?.indexOf("Campos devueltos") ?? 0,
    );
    expect(vista.textContent).not.toContain("SELECT");
  });

  it("muestra claramente el estado sin filtros", () => {
    const vista = montar({
      resumen: { ...resumenBase, estado: "sin_filtros", filtros: [] },
    });
    expect(vista.textContent).toContain("No se detectaron filtros");
    expect(vista.textContent).toContain(
      "No se detectaron filtros ni parámetros",
    );
  });

  it("muestra el estado de error y permite reintentar", () => {
    const vista = montar({ error: new Error("Sin conexión") });
    expect(vista.textContent).toContain("No se pudo obtener el resumen");
    expect(vista.textContent).toContain("Sin conexión");
    expect(vista.textContent).toContain("Reintentar");
  });

  it("presenta errores incompatibles como una acción entendible", () => {
    const vista = montar({
      resumen: {
        ...resumenBase,
        estado: "script_no_compatible",
        advertencias: [
          "Abre el Dataflow en Qlik Cloud, corrige los pasos marcados con error y luego selecciona “Actualizar resumen”.",
        ],
      },
    });
    expect(vista.textContent).toContain("Qué debes hacer");
    expect(vista.textContent).toContain("corrige los pasos");
    expect(vista.textContent).not.toContain("Unknown statement");
    expect(vista.textContent).not.toContain("InvalidDataflow");
  });
});
