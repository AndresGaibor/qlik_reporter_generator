import { describe, expect, it, vi } from "bun:test";
import { Readable } from "node:stream";
import { Hono } from "hono";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { PuertoAlmacenamientoDescargas } from "../aplicacion/puerto-almacenamiento-descargas.js";
import { crearRutasDescargas } from "./rutas-descargas.js";

describe("preview de usuario final para administradores", () => {
  it("bloquea el endpoint administrativo cuando el admin está previsualizando", async () => {
    const listarEjecucionesDescargas = vi.fn(async () => []);
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "admin-1",
      roles: ["admin" as const],
    };
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: {
        listarEjecucionesDescargas,
        obtenerEjecucionDescarga: async () => null,
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({ listar: async () => [] }) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono().route("/api/descargas", rutas);

    const respuesta = await app.request("/api/descargas/administracion", {
      headers: { Cookie: "qlik_vista_usuario_final=1" },
    });

    expect(respuesta.status).toBe(403);
    expect(listarEjecucionesDescargas).not.toHaveBeenCalled();
  });

  it("trata al admin como usuario normal al abrir una ejecución directa durante preview", async () => {
    const obtenerEjecucionDescarga = vi.fn(async (contexto) =>
      contexto.esAdministrador
        ? {
            id: "e-1",
            estado: "completada",
            uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
          }
        : null,
    );
    const sesion = {
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "admin-1",
      roles: ["admin" as const],
    };
    const abrirLectura = vi.fn(() => Readable.from(["secreto"]));
    const rutas = crearRutasDescargas({
      resolverSesion: async () => sesion,
      resolverQlik: async () => ({}) as unknown as ServicioQlik,
      repositorioReportes: {
        obtenerEjecucionDescarga,
      } as unknown as PuertoRepositorioReportes,
      resolverAlmacenamiento: async () =>
        ({
          listar: async () => [
            {
              nombre: "parte-001.csv",
              rutaCompleta: "POCs/TalendDescargados/ventas/e-1/parte-001.csv",
              tamanoBytes: 7,
            },
          ],
          abrirLectura,
        }) as unknown as PuertoAlmacenamientoDescargas,
    });
    const app = new Hono().route("/api/descargas", rutas);

    const respuesta = await app.request(
      "/api/descargas/e-1/archivo?nombre=parte-001.csv",
      { headers: { Cookie: "qlik_vista_usuario_final=1" } },
    );

    expect(respuesta.status).toBe(404);
    expect(obtenerEjecucionDescarga).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: "admin-1",
        esAdministrador: false,
      }),
    );
    expect(abrirLectura).not.toHaveBeenCalled();
  });
});
