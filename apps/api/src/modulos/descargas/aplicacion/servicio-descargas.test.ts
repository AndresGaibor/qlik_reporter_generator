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
          creadoPorUsuarioId?: string | null;
          flujoNombreSnapshot: string;
          automatizacionIdQlik: string;
          estado: string;
          mensajeError: string | null;
          uriBaseGcs: string;
          creadoEn: Date;
          finalizadoEn: Date | null;
        }>,
    ),
    marcarEjecucionCompletada: vi.fn(async () => undefined),
    marcarGcsFinalizada: vi.fn(async () => undefined),
    obtenerEjecucionDescarga: vi.fn(
      async () =>
        null as {
          id: string;
          creadoPorUsuarioId?: string | null;
          flujoNombreSnapshot: string;
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
    estaFinalizada: vi.fn(async () => false),
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
      flujoNombreSnapshot: "Ventas",
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

  it("promueve una ejecución iniciada solo cuando existe el marcador final en GCS", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-lista",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "iniciada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-lista/",
      creadoEn: new Date(),
      finalizadoEn: null,
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "parte-001-000000000000.csv.gz", tamanoBytes: 1024 },
    ]);
    alm.estaFinalizada.mockResolvedValue(true);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const manifiesto = await servicio.crearManifiesto("e-lista", CONTEXTO);

    expect(manifiesto.archivos).toHaveLength(1);
    expect(repo.marcarGcsFinalizada).toHaveBeenCalledWith(
      "e-lista",
      expect.any(Date),
    );
    expect(alm.estaFinalizada).toHaveBeenCalledWith(
      "POCs/TalendDescargados/ventas/e-lista/",
    );
  });

  it("crearManifiesto rechaza ejecución sin archivos en GCS", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-vacia",
      flujoNombreSnapshot: "Ventas",
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
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-completa/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "parte-002-000000000000.csv.gz", tamanoBytes: 2048 },
      { nombre: "parte-001-000000000000.csv.gz", tamanoBytes: 1024 },
    ]);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.crearManifiesto("e-completa", CONTEXTO);

    expect(resultado.descargaId).toBe("e-completa");
    expect(resultado.archivos).toHaveLength(2);
    expect(resultado.archivos[0].nombre).toBe("parte-001-000000000000.csv.gz");
    expect(resultado.archivos[1].nombre).toBe("parte-002-000000000000.csv.gz");
    expect(resultado.archivos[0].url).toContain("signed");
    expect(alm.firmar).toHaveBeenCalledTimes(2);
  });

  it("listarEjecuciones devuelve resumen de ejecuciones ordenadas", async () => {
    const repo = crearRepoMock();
    repo.listarEjecucionesDescargas.mockResolvedValue([
      {
        id: "e-2",
        creadoPorUsuarioId: "33333333-3333-4333-8333-333333333333",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-2/",
        creadoEn: new Date("2026-08-15T00:00:00Z"),
        finalizadoEn: new Date("2026-08-15T00:01:00Z"),
      },
      {
        id: "e-1",
        flujoNombreSnapshot: "Ventas",
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
    expect(resultado[0].creadoPorUsuarioId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(repo.listarEjecucionesDescargas).toHaveBeenCalledWith(
      {
        tenantQlikId: CONTEXTO.tenantQlikId,
        organizacionId: CONTEXTO.organizacionId,
      },
      10,
    );
  });

  it("listarEjecuciones refleja completada cuando GCS ya tiene el marcador final", async () => {
    const repo = crearRepoMock();
    repo.listarEjecucionesDescargas.mockResolvedValue([
      {
        id: "e-lista",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "iniciada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-lista/",
        creadoEn: new Date("2026-08-17T19:00:00Z"),
        finalizadoEn: null,
      },
    ]);
    const alm = crearAlmacenamientoMock();
    alm.estaFinalizada.mockResolvedValue(true);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.listarEjecuciones(CONTEXTO, 10);

    expect(resultado[0]?.estado).toBe("completada");
    expect(resultado[0]?.finalizadoEn).not.toBeNull();
    expect(repo.marcarGcsFinalizada).toHaveBeenCalledWith(
      "e-lista",
      expect.any(Date),
    );
  });

  it("crearManifiesto rechaza prefijo GCS inválido", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-invalida",
      flujoNombreSnapshot: "Ventas",
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
  it("crearManifiesto ignora objetos con extensiones no descargables", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-completa",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-completa/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "parte-001-000000000000.csv.gz", tamanoBytes: 1024 },
      { nombre: "metadata.json", tamanoBytes: 12 },
    ]);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.crearManifiesto("e-completa", CONTEXTO);

    expect(resultado.archivos.map((archivo) => archivo.nombre)).toEqual([
      "parte-001-000000000000.csv.gz",
    ]);
    expect(alm.firmar).toHaveBeenCalledTimes(1);
  });
  it("traduce falta de permisos de GCS a un error claro", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-permisos",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-permisos/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock();
    alm.listar.mockRejectedValue(
      Object.assign(new Error("storage.objects.list denied"), { code: 403 }),
    );
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-permisos", CONTEXTO),
    ).rejects.toMatchObject({
      codigo: "GCS_SIN_PERMISOS",
    });
  });

  it("traduce error al firmar URL a un mensaje claro", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-firma",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "completada",
      mensajeError: null,
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-firma/",
      creadoEn: new Date(),
      finalizadoEn: new Date(),
    });
    const alm = crearAlmacenamientoMock([
      { nombre: "ventas.csv", tamanoBytes: 10 },
    ]);
    alm.firmar.mockRejectedValue(new Error("signBlob denied"));
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-firma", CONTEXTO),
    ).rejects.toMatchObject({
      codigo: "URL_FIRMADA_NO_DISPONIBLE",
    });
  });

  it("informa permisos de GCS al consultar el marcador de una ejecución activa", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-activa-permisos",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "iniciada",
      mensajeError: null,
      uriBaseGcs:
        "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-activa-permisos/",
      creadoEn: new Date(),
      finalizadoEn: null,
    });
    const alm = crearAlmacenamientoMock();
    alm.estaFinalizada.mockRejectedValue(
      Object.assign(new Error("storage.objects.list denied"), { code: 403 }),
    );
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-activa-permisos", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "GCS_SIN_PERMISOS" });
  });

  it("crearManifiesto persiste gcsFinalizadoEn al detectar marcador GCS sin sobrescribir estado error previo", async () => {
    const repo = crearRepoMock();
    repo.obtenerEjecucionDescarga.mockResolvedValue({
      id: "e-error-previo",
      flujoNombreSnapshot: "Ventas",
      automatizacionIdQlik: "auto-1",
      estado: "error",
      mensajeError: "Falló Talend",
      uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-error-previo/",
      creadoEn: new Date(),
      finalizadoEn: null,
    });
    const alm = crearAlmacenamientoMock();
    alm.estaFinalizada.mockResolvedValue(true);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await expect(
      servicio.crearManifiesto("e-error-previo", CONTEXTO),
    ).rejects.toMatchObject({ codigo: "EJECUCION_NO_COMPLETADA" });
  });

  it("listarEjecuciones persiste gcsFinalizadoEn una sola vez al detectar marcador GCS", async () => {
    const repo = crearRepoMock();
    repo.listarEjecucionesDescargas.mockResolvedValue([
      {
        id: "e-gcs-listo",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "iniciada",
        mensajeError: null,
        uriBaseGcs: "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-gcs-listo/",
        creadoEn: new Date("2026-08-20T19:00:00Z"),
        finalizadoEn: null,
      },
    ]);
    const alm = crearAlmacenamientoMock();
    alm.estaFinalizada.mockResolvedValue(true);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    await servicio.listarEjecuciones(CONTEXTO, 10);

    expect(repo.marcarGcsFinalizada).toHaveBeenCalledWith(
      "e-gcs-listo",
      expect.any(Date),
    );
  });

  it("listarEjecuciones no llama marcarGcsFinalizada si gcsFinalizadoEn ya esta persistido", async () => {
    const repo = crearRepoMock();
    repo.listarEjecucionesDescargas.mockResolvedValue([
      {
        id: "e-ya-finalizado",
        flujoNombreSnapshot: "Ventas",
        automatizacionIdQlik: "auto-1",
        estado: "completada",
        mensajeError: null,
        uriBaseGcs:
          "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-ya-finalizado/",
        creadoEn: new Date("2026-08-20T19:00:00Z"),
        finalizadoEn: new Date("2026-08-20T19:05:00Z"),
      },
    ]);
    const alm = crearAlmacenamientoMock();
    alm.estaFinalizada.mockResolvedValue(true);
    const servicio = new ServicioDescargas(
      repo as unknown as PuertoRepositorioReportes,
      alm,
      15,
    );

    const resultado = await servicio.listarEjecuciones(CONTEXTO, 10);

    expect(resultado[0]?.estado).toBe("completada");
    expect(repo.marcarGcsFinalizada).not.toHaveBeenCalled();
  });
});
