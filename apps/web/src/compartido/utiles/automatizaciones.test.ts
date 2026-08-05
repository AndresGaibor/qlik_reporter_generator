import type { ResumenAutomatizacion } from "@/modulos/reportes/api";
import { describe, expect, test } from "vitest";
import {
  claseEstado,
  estadoVisual,
  obtenerAutorReporte,
  resumenUltimaEjecucion,
} from "./automatizaciones";

function crearResumen(
  cambios: Partial<ResumenAutomatizacion> = {},
): ResumenAutomatizacion {
  return {
    id: "automation-1",
    nombre: "Reporte de clientes",
    espacioNombre: "Ventas",
    propietarioNombre: "Andres Gaibor",
    activa: true,
    modoEjecucion: "manual",
    ejecucionActiva: false,
    puedeEjecutar: true,
    creadoEn: "2026-07-29T10:00:00.000Z",
    modificadoEn: "2026-07-30T10:00:00.000Z",
    ...cambios,
  };
}

describe("estado operativo de reportes", () => {
  test("distingue disponible, ejecución, error e inactivo", () => {
    expect(estadoVisual(crearResumen())).toBe("Disponible");
    expect(
      estadoVisual(
        crearResumen({ ejecucionActiva: true, puedeEjecutar: false }),
      ),
    ).toBe("En ejecución");
    expect(
      estadoVisual(crearResumen({ ultimaEjecucionEstado: "failed" })),
    ).toBe("Requiere atención");
    expect(estadoVisual(crearResumen({ activa: false }))).toBe("Inactivo");
  });

  test("asigna un tono visual coherente al estado", () => {
    expect(claseEstado(crearResumen())).toContain("brand");
    expect(
      claseEstado(crearResumen({ ultimaEjecucionEstado: "failed" })),
    ).toContain("red");
  });
});

describe("resumen de la última ejecución", () => {
  test("presenta resultado, fecha y duración", () => {
    const texto = resumenUltimaEjecucion(
      crearResumen({
        ultimaEjecucionEstado: "finished",
        ultimaEjecucionInicio: "2026-07-30T20:00:00.000Z",
        ultimaEjecucionFin: "2026-07-30T20:01:30.000Z",
      }),
    );

    expect(texto).toContain("Completada");
    expect(texto).toContain("1 min 30 s");
  });

  test("explica cuando todavía no existe una ejecución", () => {
    expect(resumenUltimaEjecucion(crearResumen())).toBe(
      "Aún no se ha ejecutado",
    );
  });
});

describe("obtenerAutorReporte", () => {
  test("devuelve el propietario real de Qlik Automate", () => {
    const auto = crearResumen({
      nombre: "Reporte VENTAS_COMERCIAL_DIARIAS_D Andrés Gaibor Apunte",
      propietarioNombre: "Byron Nasimba Quinatoa",
    });
    expect(obtenerAutorReporte(auto)).toBe("Byron Nasimba Quinatoa");
  });
});
