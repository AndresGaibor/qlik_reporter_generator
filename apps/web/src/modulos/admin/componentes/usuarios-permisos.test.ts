import { describe, expect, it } from "vitest";
import {
  puedeCambiarRolUsuario,
  puedeQuitarUsuario,
} from "./usuarios-permisos";

const administrador = {
  id: "a1",
  nombre: "Admin",
  correo: "admin@empresa.com",
  rol: "admin" as const,
};
const usuario = {
  id: "u1",
  nombre: "Usuario",
  correo: "user@empresa.com",
  rol: "usuario" as const,
};

describe("protecciones de usuarios", () => {
  it("impide quitar o degradar al último administrador", () => {
    expect(puedeQuitarUsuario(administrador, [administrador, usuario])).toBe(
      false,
    );
    expect(
      puedeCambiarRolUsuario(administrador, "usuario", [
        administrador,
        usuario,
      ]),
    ).toBe(false);
  });

  it("permite cambios cuando existe otro administrador", () => {
    const segundo = { ...administrador, id: "a2", correo: "otro@empresa.com" };
    expect(puedeQuitarUsuario(administrador, [administrador, segundo])).toBe(
      true,
    );
    expect(
      puedeCambiarRolUsuario(administrador, "usuario", [
        administrador,
        segundo,
      ]),
    ).toBe(true);
  });
});
