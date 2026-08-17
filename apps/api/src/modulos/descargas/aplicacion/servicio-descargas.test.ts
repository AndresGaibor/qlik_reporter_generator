import { describe, expect, it, vi } from "bun:test";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import { ServicioDescargas } from "./servicio-descargas.js";

const CONTEXTO = {
  tenantQlikId: "22222222-2222-4222-8222-222222222222",
  organizacionId: "11111111-1111-4111-8111-111111111111",
} as const;

function crearRepoMock() {
  return {
    listarEjecucionesDescargas: vi.fn(
      async () =>
        [] as Array<{
          id: string;
          reporteNombre: string;
          automatizacionIdQlik: string;
          estado: string;
          mensajeError: string | null;
          uriBaseGcs: string;
          creadoEn: Date;
          finalizadoEn: Date | null;
        }>,
    ),
    obtenerEjecucionDescarga: vi.fn(
      async () =>
        null as {
          id: string;
          reporteNombre: string;
          automatizacionIdQlik: string;
          estado: string;
          mensajeError: string | null;
          uriBaseGcs: string;
          creadoEn: Date;
          finalizadoEn: Date | null;
        } | null,
    ),
  };
}

function crearAlmacenamientoMock(
  archivos: Array<{ nombre: string; tamanoBytes: number }> = [],
) {
  return {
    listar: vi.fn(async () =>
      archivos.map((a) => ({
        ...a,
        rutaCompleta: `POCs/TalendDescargados/ventas/e-1/${a.nombre}`,
      })),
    ),
    firmar: vi.fn(
      async (nombreObjeto: string, _minutos: number) =>
        `https://storage.example.com/${nombreObjeto}?signed`,
    ),
  };
}

describe("ServicioDescargas", () => {
  it("crearManifiesto rechaza ejecución de otro tenant", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue(null);
    const alm = crearAlmacenamientoMock();
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-ajena", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "EJECUCION_NO_ENCONTRADA" });
  });

  it("crearManifiesto rechaza ejecución no completada", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-activa",
      reporteNombre: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "iniciada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-activa/",
      creadoEn: new Date(),
      finalizadoEn: null,
    });
    const alm = crearAlmacenamientoMock();
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-activa", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "EJECUCION_NO_COMPLETADA" });
  });

  it("crearManifiesto rechaza ejecución sin archivos en GCS", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-vacia",
      reporteNombre: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-vacia/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([]);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-vacia", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "ARCHIVOS_NO_DISPONIBLES" });
  });

  it("crearManifiesto devuelve manifiesto con archivos firmados ordenados por nombre", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-completa",
      reporteNombre: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-completa/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "reporte-b.csv", tamanoBytes: 2048 },
      { nombre: "reporte-a.csv", tamanoBytes: 1024 },
    ]);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.crearManifiesto("e-completa", CONTEXTO);

    expect(resultado.descargaId).toBe("e-completa");
    expect(resultado.archivos).toHaveLength(2);
    expect(resultado.archivos[0].nombre).toBe("reporte-a.csv");
    expect(resultado.archivos[1].nombre).toBe("reporte-b.csv");
    expect(resultado.archivos[0].url).toContain("signed");
    expect(alm.firmar).toHaveBeenCalledTimes(2);
  });

  it("listarEjecuciones devuelve resumen de ejecuciones ordenadas", async () => {
    const repo = crearRepoMock();
    repo.listarEjecucionesDescargas.mockResolvedValue([
      {
        id: "e-2",
        reporteNombre: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-2/",
        creadoEn: new Date("2026-08-15T00:00:00Z"),
        finalizadoEn: new Date("2026-08-15T00:01:00Z"),
      },
      {
        id: "e-1",
        reporteNombre: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "error",
        mensajeError: "Falló Talend",
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
        creadoEn: new Date("2026-08-14T00:00:00Z"),
        finalizadoEn: new Date("2026-08-14T00:01:00Z"),
      },
    ]);
    const alm = crearAlmacenamientoMock();
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.listarEjecuciones(CONTEXTO, 10);

    expect(resultado).toHaveLength(2);
    expect(resultado[0].id).toBe("e-2");
    expect(repo.listarEjecucionesDescargas).toHaveBeenCalledWith(
      {
        tenantQlikId: CONTEXTO.tenantQlikId,
        organizacionId: CONTEXTO.organizacionId,
      },
      10,
    );
  });

  it("crearManifiesto rechaza prefijo GCS inválido", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-invalida",
      reporteNombre: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "archivo.csv", tamanoBytes: 1024 },
    ]);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-invalida", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "PREFIJO_GCS_INVALIDO" });
  });
});
