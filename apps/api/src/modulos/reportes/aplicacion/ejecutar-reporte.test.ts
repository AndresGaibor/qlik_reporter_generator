import { describe, expect, it, vi } from "bun:test";
import {
  EjecutarReporte,
  construirCarpetaDescargasReporte,
} from "./ejecutar-reporte.js";

const SCRIPT =
  "LIB CONNECT TO [Google BigQuery:Prod]; SQL SELECT id FROM `p.d.t`;";
const worker = { id: "worker-db-1", automatizacionIdQlik: "worker-1" };
const fixture = new URL(
  "../fixtures/compiler-corpus/qlik/regression-bq-inventario-if-outer-join.qlik",
  import.meta.url,
);
const workspace = JSON.parse(
  await Bun.file(
    new URL(
      "../fixtures/automate-talend-workspace-sql.sanitized.json",
      import.meta.url,
    ),
  ).text(),
);

function caso(opciones: { estimarError?: Error; script?: string } = {}) {
  const qlik = {
    listarFlujos: vi.fn(async () => [
      {
        id: "df-1",
        appId: "app-real-1",
        name: "Ventas Diarias",
        spaceId: "sp-1",
      },
    ]),
    obtenerScriptApp: vi.fn(async () => ({
      script: opciones.script ?? SCRIPT,
    })),
    obtenerAutomatizacion: vi.fn(async () => ({
      id: "worker-1",
      name: "Worker",
      workspace: structuredClone(workspace),
    })),
    actualizarAutomatizacion: vi.fn(
      async (_id: string, definicion: Record<string, unknown>) => definicion,
    ),
    ejecutarAutomatizacion: vi.fn(async () => ({ runId: "run-1" })),
  };
  const repositorio = {
    crearEjecucion: vi.fn(async (entrada: Record<string, unknown>) => entrada),
    marcarEjecucionIniciada: vi.fn(async () => undefined),
    marcarEjecucionError: vi.fn(async () => undefined),
  };
  const workers = { ejecutar: vi.fn(async () => worker) };
  const estimador = {
    estimarConsulta: vi.fn(async () => {
      if (opciones.estimarError) throw opciones.estimarError;
      return { bytesProcesados: 123, costoEstimadoUsd: 0.01 };
    }),
  };
  const ejecutar = new EjecutarReporte(
    qlik as never,
    repositorio as never,
    {
      ejecutarExclusivo: async (_: string, tarea: () => Promise<unknown>) =>
        tarea(),
    } as never,
    {
      projectId: "p",
      dataset: "d",
      credencialesJson: '{"type":"service_account","project_id":"p"}',
      estimador,
    },
    () => "11111111-1111-4111-8111-111111111111",
    () => ({
      organizacionId: "org-1",
      tenantQlikId: "tenant-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
      plantillaIdQlik: "base",
      plantillaNombre: "Base",
    }),
    workers as never,
  );
  return { ejecutar, qlik, repositorio, workers, estimador };
}

describe("nombre de carpeta de descargas", () => {
  it("genera una carpeta estable y legible desde el nombre del reporte", () => {
    expect(construirCarpetaDescargasReporte("Copia de Test_BQ_SFTP 2")).toBe(
      "copia-de-test-bq-sftp-2/",
    );
  });
});

describe("EjecutarReporte", () => {
  it("resuelve el Dataflow actual por flujoIdQlik y audita su snapshot", async () => {
    const { ejecutar, qlik, repositorio, workers } = caso();
    const resultado = await ejecutar.ejecutar({
      flujoIdQlik: "df-1",
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
      correo: "Andres.Gaibor+reportes@correo.com",
    });
    expect(resultado.carpetaDescargas).toBe("ventas-diarias/");
    expect(qlik.obtenerScriptApp).toHaveBeenCalledWith("app-real-1", "current");
    expect(workers.ejecutar).toHaveBeenCalled();
    expect(repositorio.crearEjecucion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizacionId: "org-1",
        tenantQlikId: "tenant-1",
        flujoIdQlik: "df-1",
        flujoNombreSnapshot: "Ventas Diarias",
        ejecutadoPorUsuarioId: "user-1",
        ejecutadoPorNombre: null,
        ejecutadoPorCorreo: "Andres.Gaibor+reportes@correo.com",
        origenEjecucion: "manual",
        flujoEspacioIdQlik: "sp-1",
        automatizacionIdQlik: "worker-1",
        uriBaseGcs:
          "gs://bkt_dwh/POCs/TalendDescargados/andresgaiborreportes/ventas-diarias/11111111-1111-4111-8111-111111111111/",
        jobIdPrincipalBigQuery: "qlikr_111111111111411181111111",
        bigqueryProjectId: "p",
        bigqueryLocation: "US",
      }),
    );
  });

  it("valida BigQuery con la credencial configurada antes de iniciar Talend", async () => {
    const { ejecutar, estimador, qlik } = caso();
    await ejecutar.ejecutar({
      flujoIdQlik: "df-1",
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
    });
    expect(estimador.estimarConsulta).toHaveBeenCalledTimes(1);
    const llamadaActualizar = qlik.actualizarAutomatizacion.mock.calls[0];
    const workspaceActualizado = llamadaActualizar?.[1].workspace as Record<
      string,
      unknown
    >;
    const blocks = workspaceActualizado.blocks as Array<
      Record<string, unknown>
    >;
    const credenciales = blocks.find((block) => block.name === "Credenciales");
    const operations = credenciales?.operations as Array<
      Record<string, unknown>
    >;
    expect(operations.find((item) => item.id === "set_value")?.value).toBe(
      "/etc/credentials/gsc.json",
    );
  });

  it("no crea worker ni inicia Talend si BigQuery rechaza la consulta", async () => {
    const { ejecutar, workers, qlik } = caso({
      estimarError: new Error("Access Denied: source table"),
    });
    await expect(
      ejecutar.ejecutar({
        flujoIdQlik: "df-1",
        tenantId: "tenant-1",
        organizacionId: "org-1",
        usuarioId: "user-1",
        usuarioIdQlik: "qlik-1",
      }),
    ).rejects.toThrow("Access Denied");
    expect(workers.ejecutar).not.toHaveBeenCalled();
    expect(qlik.ejecutarAutomatizacion).not.toHaveBeenCalled();
  });

  it("exige confirmar el hash del riesgo y vuelve a validarlo si cambia el Dataflow", async () => {
    const scriptRiesgoso = (await Bun.file(fixture).text())
      .replace("OUTER JOIN", "FULL JOIN")
      .replaceAll("ID_UOP", "FECHA");
    const contexto = caso({ script: scriptRiesgoso });
    const entrada = {
      flujoIdQlik: "df-1",
      tenantId: "tenant-1",
      organizacionId: "org-1",
      usuarioId: "user-1",
      usuarioIdQlik: "qlik-1",
    };

    const primerError = await contexto.ejecutar
      .ejecutar(entrada)
      .catch((error) => error);
    expect(primerError).toMatchObject({
      codigo: "EXECUTION_RISK_CONFIRMATION_REQUIRED",
    });
    const h1 = primerError.detalles.hashDataflowSha256;
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(contexto.workers.ejecutar).not.toHaveBeenCalled();
    expect(contexto.qlik.ejecutarAutomatizacion).not.toHaveBeenCalled();

    await contexto.ejecutar.ejecutar({
      ...entrada,
      confirmacionRiesgo: { hashDataflowSha256: h1 },
    });
    expect(contexto.qlik.ejecutarAutomatizacion).toHaveBeenCalledTimes(1);

    contexto.qlik.obtenerScriptApp.mockResolvedValueOnce({
      script: `${scriptRiesgoso}\n// cambio`,
    });
    const segundoError = await contexto.ejecutar
      .ejecutar({ ...entrada, confirmacionRiesgo: { hashDataflowSha256: h1 } })
      .catch((error) => error);
    expect(segundoError).toMatchObject({
      codigo: "EXECUTION_RISK_CONFIRMATION_REQUIRED",
    });
    const h2 = segundoError.detalles.hashDataflowSha256;
    expect(h2).not.toBe(h1);
    expect(contexto.qlik.ejecutarAutomatizacion).toHaveBeenCalledTimes(1);
    contexto.qlik.obtenerScriptApp.mockResolvedValue({
      script: `${scriptRiesgoso}\n// cambio`,
    });

    await contexto.ejecutar.ejecutar({
      ...entrada,
      confirmacionRiesgo: { hashDataflowSha256: h2 },
    });
    expect(contexto.qlik.ejecutarAutomatizacion).toHaveBeenCalledTimes(2);
  });

  it("falla si el Dataflow no pertenece al tenant visible", async () => {
    const { ejecutar } = caso();
    await expect(
      ejecutar.ejecutar({
        flujoIdQlik: "df-404",
        tenantId: "tenant-1",
        organizacionId: "org-1",
        usuarioId: "user-1",
        usuarioIdQlik: "qlik-1",
      }),
    ).rejects.toMatchObject({ codigo: "DATAFLOW_NO_ENCONTRADO" });
  });
});
