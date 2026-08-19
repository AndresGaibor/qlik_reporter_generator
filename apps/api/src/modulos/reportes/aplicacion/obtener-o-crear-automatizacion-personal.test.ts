import { describe, expect, it, vi } from "bun:test";
import type { PuertoBloqueoEjecucion } from "../../automatizaciones/aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { ErrorApiQlik } from "../../qlik/infraestructura/error-api-qlik.js";
import { ObtenerOCrearAutomatizacionPersonal } from "./obtener-o-crear-automatizacion-personal.js";
import type {
  AutomatizacionPersonalPersistida,
  PuertoRepositorioAutomatizacionesPersonales,
} from "./puertos/puerto-repositorio-automatizaciones-personales.js";

const ctx = {
  organizacionId: "org-1",
  tenantQlikId: "tenant-1",
  usuarioId: "user-1",
  usuarioIdQlik: "qlik-user-1",
  plantillaIdQlik: "template-1",
  plantillaNombre: "Plantilla Talend",
};

async function workspaceValido() {
  const fixture = new URL(
    "../fixtures/automate-talend-workspace.sanitized.json",
    import.meta.url,
  );
  return JSON.parse(await Bun.file(fixture).text()) as Record<string, unknown>;
}

function persistida(id = "row-1", automatizacionIdQlik = "worker-1") {
  return {
    id,
    organizacionId: ctx.organizacionId,
    tenantQlikId: ctx.tenantQlikId,
    usuarioId: ctx.usuarioId,
    automatizacionIdQlik,
    automatizacionNombreSnapshot: "Worker personal",
    estado: "activo" as const,
  };
}

function construir(opts: {
  repo?: Partial<PuertoRepositorioAutomatizacionesPersonales>;
  qlik?: Partial<ServicioQlik>;
  lock?: PuertoBloqueoEjecucion;
}) {
  const repo = {
    obtener: vi.fn(async () => null),
    crear: vi.fn(async (entrada) => ({ id: "row-1", ...entrada })),
    actualizar: vi.fn(async (id, cambios) => ({
      ...persistida(id),
      ...cambios,
    })),
    listarPorTenant: vi.fn(async () => []),
    ...opts.repo,
  } as unknown as PuertoRepositorioAutomatizacionesPersonales;
  const qlik = {
    obtenerAutomatizacion: vi.fn(async (id: string) => ({
      id,
      name: "Base",
      workspace: await workspaceValido(),
    })),
    copiarAutomatizacion: vi.fn(async () => ({ id: "worker-new" })),
    actualizarAutomatizacion: vi.fn(async (id, definicion) => ({
      id,
      ...definicion,
    })),
    cambiarPropietarioAutomatizacion: vi.fn(async () => undefined),
    eliminarAutomatizacion: vi.fn(async () => undefined),
    ...opts.qlik,
  } as unknown as ServicioQlik;
  const lock = opts.lock ?? {
    ejecutarExclusivo: vi.fn(async (_key, tarea) => tarea()),
  };
  return {
    caso: new ObtenerOCrearAutomatizacionPersonal(qlik, repo, lock),
    repo,
    qlik,
    lock,
  };
}

describe("ObtenerOCrearAutomatizacionPersonal", () => {
  it("reutiliza un worker persistido compatible", async () => {
    const { caso, repo, qlik } = construir({
      repo: { obtener: vi.fn(async () => persistida()) },
    });
    const resultado = await caso.ejecutar(ctx);
    expect(resultado.id).toBe("row-1");
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
    expect(qlik.obtenerAutomatizacion).toHaveBeenCalledWith("worker-1");
    expect(repo.actualizar).not.toHaveBeenCalled();
  });

  it("hace double-check bajo lock y copia una sola vez en concurrencia", async () => {
    let actual: AutomatizacionPersonalPersistida | null = null;
    const repo = {
      obtener: vi.fn(async () => actual),
      crear: vi.fn(
        async (
          entrada: Parameters<
            PuertoRepositorioAutomatizacionesPersonales["crear"]
          >[0],
        ) => {
          actual = { id: "row-1", ...entrada };
          return actual;
        },
      ),
    };
    let cola = Promise.resolve();
    const gate: PuertoBloqueoEjecucion = {
      ejecutarExclusivo: <T>(
        _key: string,
        tarea: () => Promise<T>,
      ): Promise<T> => {
        const siguiente = cola.then(tarea);
        cola = siguiente.then(
          () => undefined,
          () => undefined,
        );
        return siguiente;
      },
    };
    const { caso, qlik } = construir({ repo, lock: gate });
    const [uno, dos] = await Promise.all([
      caso.ejecutar(ctx),
      caso.ejecutar(ctx),
    ]);
    expect(uno.id).toBe(dos.id);
    expect(qlik.copiarAutomatizacion).toHaveBeenCalledTimes(1);
  });

  it("valida la plantilla antes de copiar", async () => {
    const qlik = {
      obtenerAutomatizacion: vi.fn(async () => ({ workspace: {} })),
      copiarAutomatizacion: vi.fn(),
    };
    const { caso } = construir({
      qlik: qlik as unknown as Partial<ServicioQlik>,
    });
    await expect(caso.ejecutar(ctx)).rejects.toMatchObject({
      codigo: "WORKER_TEMPLATE_INCOMPATIBLE",
    });
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("limpia la copia si el workspace copiado es incompatible", async () => {
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockResolvedValueOnce({
          id: "template-1",
          workspace: await workspaceValido(),
        })
        .mockResolvedValueOnce({ id: "worker-new", workspace: {} }),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    };
    const { caso, repo } = construir({
      qlik: qlik as unknown as Partial<ServicioQlik>,
    });
    await expect(caso.ejecutar(ctx)).rejects.toMatchObject({
      codigo: "WORKER_COPY_INCOMPATIBLE",
    });
    expect(
      qlik.eliminarAutomatizacion as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledWith("worker-new");
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("recrea un 404 y actualiza la misma fila", async () => {
    const existente = persistida();
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockRejectedValueOnce(new ErrorApiQlik(404, "Not Found", "/worker-1"))
        .mockResolvedValueOnce({
          id: "template-1",
          workspace: await workspaceValido(),
        })
        .mockResolvedValueOnce({
          id: "worker-new",
          workspace: await workspaceValido(),
        }),
    };
    const { caso, repo } = construir({
      repo: { obtener: vi.fn(async () => existente) },
      qlik,
    });
    const resultado = await caso.ejecutar(ctx);
    expect(resultado.id).toBe("row-1");
    expect(repo.actualizar).toHaveBeenCalledWith(
      "row-1",
      expect.objectContaining({ automatizacionIdQlik: "worker-new" }),
    );
  });

  it("rechaza un worker existente incompatible sin mutarlo", async () => {
    const { caso, repo, qlik } = construir({
      repo: { obtener: vi.fn(async () => persistida()) },
      qlik: {
        obtenerAutomatizacion: vi.fn(async () => ({ workspace: {} })),
      } as unknown as Partial<ServicioQlik>,
    });
    await expect(caso.ejecutar(ctx)).rejects.toMatchObject({
      codigo: "WORKER_INCOMPATIBLE",
    });
    expect(repo.actualizar).not.toHaveBeenCalled();
    expect(qlik.actualizarAutomatizacion).not.toHaveBeenCalled();
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalled();
  });

  it("si el lock está ocupado reutiliza una fila compatible sin mutarla", async () => {
    const lock: PuertoBloqueoEjecucion = {
      ejecutarExclusivo: vi.fn(async () => undefined),
    };
    const { caso, repo, qlik } = construir({
      lock,
      repo: { obtener: vi.fn(async () => persistida()) },
    });

    const resultado = await caso.ejecutar(ctx);

    expect(resultado.id).toBe("row-1");
    expect(repo.actualizar).not.toHaveBeenCalled();
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
    expect(qlik.actualizarAutomatizacion).not.toHaveBeenCalled();
  });

  it("si el lock está ocupado y no hay fila devuelve WORKER_LOCK_BUSY", async () => {
    const lock: PuertoBloqueoEjecucion = {
      ejecutarExclusivo: vi.fn(async () => undefined),
    };
    const { caso, qlik } = construir({ lock });

    await expect(caso.ejecutar(ctx)).rejects.toMatchObject({
      codigo: "WORKER_LOCK_BUSY",
    });
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("si el lock está ocupado y la fila da 404 no recrea fuera del lock", async () => {
    const lock: PuertoBloqueoEjecucion = {
      ejecutarExclusivo: vi.fn(async () => undefined),
    };
    const { caso, repo, qlik } = construir({
      lock,
      repo: { obtener: vi.fn(async () => persistida()) },
      qlik: {
        obtenerAutomatizacion: vi.fn(async () => {
          throw new ErrorApiQlik(404, "Not Found", "/workers/worker-1");
        }),
      },
    });

    await expect(caso.ejecutar(ctx)).rejects.toMatchObject({
      codigo: "WORKER_LOCK_BUSY",
    });
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
    expect(repo.actualizar).not.toHaveBeenCalled();
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 503])(
    "propaga un GET del worker con estado %s sin marcar incompatibilidad",
    async (estado) => {
      const error = new ErrorApiQlik(estado, "Qlik error", "/workers/worker-1");
      const { caso, repo } = construir({
        repo: { obtener: vi.fn(async () => persistida()) },
        qlik: {
          obtenerAutomatizacion: vi.fn(async () => {
            throw error;
          }),
        },
      });

      await expect(caso.ejecutar(ctx)).rejects.toBe(error);
      expect(repo.actualizar).not.toHaveBeenCalled();
    },
  );

  it("propaga un fallo de integración al validar la plantilla", async () => {
    const error = new ErrorApiQlik(
      429,
      "Too Many Requests",
      "/templates/template-1",
    );
    const { caso, qlik } = construir({
      qlik: {
        obtenerAutomatizacion: vi.fn(async () => {
          throw error;
        }),
      },
    });

    await expect(caso.ejecutar(ctx)).rejects.toBe(error);
    expect(qlik.copiarAutomatizacion).not.toHaveBeenCalled();
  });

  it("no elimina una copia cuando su GET posterior falla por integración", async () => {
    const error = new ErrorApiQlik(503, "Unavailable", "/workers/worker-new");
    const qlik = {
      obtenerAutomatizacion: vi
        .fn()
        .mockResolvedValueOnce({ workspace: await workspaceValido() })
        .mockRejectedValueOnce(error),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    };
    const { caso, repo } = construir({
      qlik: qlik as unknown as Partial<ServicioQlik>,
    });

    await expect(caso.ejecutar(ctx)).rejects.toBe(error);
    expect(qlik.eliminarAutomatizacion).not.toHaveBeenCalled();
    expect(repo.crear).not.toHaveBeenCalled();
  });
});
