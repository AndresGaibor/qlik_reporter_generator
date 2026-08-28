import { describe, expect, it, vi } from "bun:test";
import type { PuertoJobsBigQuery } from "../../google-cloud/aplicacion/puerto-jobs-bigquery.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { CancelarEjecucionReporte } from "./cancelar-ejecucion-reporte.js";
import type {
  EjecucionReportePersistida,
  PuertoRepositorioReportes,
} from "./puertos/puerto-repositorio-reportes.js";

const base = (
  estado: EjecucionReportePersistida["estado"],
): EjecucionReportePersistida => ({
  id: "exec-1",
  organizacionId: "org-1",
  tenantQlikId: "tenant-1",
  flujoIdQlik: "flow-1",
  flujoNombreSnapshot: "Reporte",
  automatizacionIdQlik: "auto-1",
  hashDataflowSha256: "a".repeat(64),
  scriptDataflow: "LOAD 1",
  sqlBigQueryCompilado: "SELECT 1",
  scriptExportacion: "EXPORT DATA",
  uriBaseGcs: "gs://bucket/report",
  estado,
  versionCompilador: 3,
  runIdQlik: "run-1",
  jobIdPrincipalBigQuery: "job-1",
  bigqueryProjectId: "project-1",
  bigqueryLocation: "US",
  ejecutadoPorUsuarioId: "user-1",
});

function setup(estado: EjecucionReportePersistida["estado"] = "iniciada") {
  const repositorio = {
    obtenerEjecucionPorId: vi.fn(async () => base(estado)),
    marcarCancelacionSolicitada: vi.fn(async () => undefined),
  } as unknown as PuertoRepositorioReportes &
    Record<string, ReturnType<typeof vi.fn>>;
  const qlik = {
    detenerEjecucion: vi.fn(async () => undefined),
  } as unknown as PuertoQlik & Record<string, ReturnType<typeof vi.fn>>;
  const jobs = {
    cancelarJob: vi.fn(async () => undefined),
  } as unknown as PuertoJobsBigQuery & Record<string, ReturnType<typeof vi.fn>>;
  const caso = new CancelarEjecucionReporte(repositorio, qlik, jobs);
  const entrada = {
    ejecucionId: "exec-1",
    flujoIdQlik: "flow-1",
    tenantId: "tenant-1",
    organizacionId: "org-1",
    usuarioId: "user-1",
    esAdministrador: false,
  };
  return { caso, entrada, repositorio, qlik, jobs };
}

describe("CancelarEjecucionReporte", () => {
  it("solicita Qlik y BigQuery y deja la ejecución cancelando", async () => {
    const { caso, entrada, repositorio, qlik, jobs } = setup();
    await expect(caso.ejecutar(entrada)).resolves.toEqual({
      estado: "cancelando",
    });
    expect(repositorio.marcarCancelacionSolicitada).toHaveBeenCalledTimes(1);
    expect(qlik.detenerEjecucion).toHaveBeenCalledWith("auto-1", "run-1");
    expect(jobs.cancelarJob).toHaveBeenCalledWith({
      projectId: "project-1",
      jobId: "job-1",
      location: "US",
    });
  });

  it("es idempotente mientras ya está cancelando", async () => {
    const { caso, entrada, repositorio } = setup("cancelando");
    await expect(caso.ejecutar(entrada)).resolves.toEqual({
      estado: "cancelando",
    });
    expect(repositorio.marcarCancelacionSolicitada).not.toHaveBeenCalled();
  });

  it("intenta ambos servicios aunque Qlik falle", async () => {
    const { caso, entrada, qlik, jobs } = setup();
    (
      qlik.detenerEjecucion as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("Qlik temporal"));
    await expect(caso.ejecutar(entrada)).resolves.toEqual({
      estado: "cancelando",
    });
    expect(jobs.cancelarJob).toHaveBeenCalledTimes(1);
  });

  it("intenta ambos servicios aunque BigQuery falle", async () => {
    const { caso, entrada, qlik, jobs } = setup();
    (jobs.cancelarJob as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("BigQuery temporal"),
    );
    await expect(caso.ejecutar(entrada)).resolves.toEqual({
      estado: "cancelando",
    });
    expect(qlik.detenerEjecucion).toHaveBeenCalledTimes(1);
  });

  it.each(["completada", "error", "detenida"] as const)(
    "devuelve el estado terminal %s sin solicitar cambios",
    async (estado) => {
      const { caso, entrada, repositorio, qlik, jobs } = setup(estado);
      await expect(caso.ejecutar(entrada)).resolves.toEqual({ estado });
      expect(repositorio.marcarCancelacionSolicitada).not.toHaveBeenCalled();
      expect(qlik.detenerEjecucion).not.toHaveBeenCalled();
      expect(jobs.cancelarJob).not.toHaveBeenCalled();
    },
  );

  it("rechaza otra organización, tenant, flujo o usuario sin permiso", async () => {
    const { caso, entrada } = setup();
    await expect(
      caso.ejecutar({ ...entrada, organizacionId: "org-2" }),
    ).rejects.toMatchObject({ estadoHttp: 404 });
    await expect(
      caso.ejecutar({ ...entrada, tenantId: "tenant-2" }),
    ).rejects.toMatchObject({ estadoHttp: 404 });
    await expect(
      caso.ejecutar({ ...entrada, flujoIdQlik: "flow-2" }),
    ).rejects.toMatchObject({ estadoHttp: 404 });
    await expect(
      caso.ejecutar({ ...entrada, usuarioId: "user-2" }),
    ).rejects.toMatchObject({ estadoHttp: 403 });
  });

  it("permite al administrador cancelar una ejecución ajena", async () => {
    const { caso, entrada, qlik } = setup();
    await expect(
      caso.ejecutar({
        ...entrada,
        usuarioId: "admin-1",
        esAdministrador: true,
      }),
    ).resolves.toEqual({ estado: "cancelando" });
    expect(qlik.detenerEjecucion).toHaveBeenCalledTimes(1);
  });
});
