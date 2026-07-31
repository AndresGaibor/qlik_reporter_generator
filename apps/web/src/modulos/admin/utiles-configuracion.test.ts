import { describe, expect, test } from "vitest";
import type { TenantResumen } from "./api";
import { seleccionarConfiguracionPrincipal } from "./utiles-configuracion";

function crearTenant(id: string, estado: string): TenantResumen {
  return {
    id,
    nombre: id,
    slug: id,
    estado,
    cantidadUsuarios: 1,
    creadoEn: "2026-07-30T00:00:00.000Z",
  };
}

describe("seleccionarConfiguracionPrincipal", () => {
  test("prioriza la configuración activa", () => {
    const seleccionada = seleccionarConfiguracionPrincipal([
      crearTenant("suspendida", "suspendida"),
      crearTenant("activa", "activa"),
    ]);

    expect(seleccionada?.id).toBe("activa");
  });

  test("usa la primera como respaldo y devuelve undefined si no hay datos", () => {
    expect(
      seleccionarConfiguracionPrincipal([crearTenant("primera", "suspendida")])
        ?.id,
    ).toBe("primera");
    expect(seleccionarConfiguracionPrincipal([])).toBeUndefined();
  });
});
