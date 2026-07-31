import { describe, expect, it } from "vitest";
import { crearResumenConfiguracion } from "./utiles-estado-configuracion";

describe("crearResumenConfiguracion", () => {
  it("resume una plataforma completamente configurada", () => {
    const items = crearResumenConfiguracion({
      empresaActiva: true,
      cantidadUsuarios: 1,
      qlik: { conectado: true, host: "empresa.qlikcloud.com" },
      oauth: { estado: "verificada" },
      plantilla: { configurada: true, nombre: "Plantilla Ventas" },
      bigQuery: { estado: "activo", dataset: "demo_lafavorita" },
    });

    expect(items.map((item) => item.estado)).toEqual([
      "Activa",
      "Conectado",
      "Verificado",
      "Configurada",
      "Conectada",
      "1 usuario autorizado",
    ]);
    expect(items.every((item) => item.completo)).toBe(true);
  });

  it("distingue configuraciones pendientes y errores", () => {
    const items = crearResumenConfiguracion({
      empresaActiva: true,
      cantidadUsuarios: 0,
      qlik: { conectado: false },
      oauth: { estado: "error" },
      plantilla: { configurada: false },
      bigQuery: { estado: "error" },
    });

    expect(items.find((item) => item.id === "qlik")?.estado).toBe("Pendiente");
    expect(items.find((item) => item.id === "oauth")?.tono).toBe("error");
    expect(items.find((item) => item.id === "bigquery")?.estado).toBe(
      "Con error",
    );
    expect(items.find((item) => item.id === "usuarios")?.estado).toBe(
      "Sin usuarios",
    );
  });
});
