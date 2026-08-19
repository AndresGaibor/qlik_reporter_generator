import { describe, expect, test } from "bun:test";
import { construirContextoSolicitud } from "./contexto-solicitud.js";

describe("ContextoSolicitud", () => {
  test("usa el tenant activo y conserva roles de la organización", () => {
    const contexto = construirContextoSolicitud({
      solicitudId: "req-1",
      sesion: {
        sesionId: "s1",
        usuarioId: "u1",
        identidadQlikId: "i2",
        usuarioIdQlik: "q2",
        tenantId: "t2",
        tenantHost: "dos.eu.qlikcloud.com",
        organizacionId: "o1",
      },
      sesionPublica: {
        tenantHost: "dos.eu.qlikcloud.com",
        usuario: {
          id: "u1",
          nombre: "Andrés",
          correo: "Andres.Gaibor@correo.com",
          avatarUrl: null,
        },
        identidad: {
          id: "i2",
          nombreQlik: "Andrés",
          correoQlik: "qlik@correo.com",
        },
        esSuperadmin: false,
        membresias: [
          { organizacionId: "o1", organizacionNombre: "Org", rol: "admin" },
        ],
        tenantsDisponibles: [],
        tenantActivoId: "t2",
      },
    });
    expect(contexto.tenantQlikId).toBe("t2");
    expect(contexto.roles).toEqual(["admin"]);
    expect(contexto.usuarioCorreo).toBe("Andres.Gaibor@correo.com");
  });
});
