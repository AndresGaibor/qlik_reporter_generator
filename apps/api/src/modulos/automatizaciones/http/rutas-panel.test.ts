import { describe, expect, it, vi } from "bun:test";
import type { PuertoAuditoria } from "../../../nucleo/auditoria/puerto-auditoria.js";
import type { PuertoOutbox } from "../../../nucleo/eventos/puerto-outbox.js";
import type { PuertoIdempotencia } from "../../../nucleo/idempotencia/puerto-idempotencia.js";
import type { ServicioQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { crearRutasPanelAutomatizaciones } from "./rutas-panel.js";

describe("POST /desde-plantilla", () => {
  it("asigna la automatización al usuario Qlik de la sesión", async () => {
    const cambiarPropietarioAutomatizacion = vi.fn(async () => undefined);
    const qlik = {
      copiarAutomatizacion: vi.fn(async () => ({ id: "copia-1" })),
      cambiarEspacioAutomatizacion: vi.fn(async () => undefined),
      cambiarPropietarioAutomatizacion,
      obtenerAutomatizacion: vi.fn(async () => ({
        id: "copia-1",
        name: "Nueva",
        schedules: [],
        workspace: {},
        description: "",
        maxConcurrentRuns: 1,
      })),
      actualizarAutomatizacion: vi.fn(async () => ({})),
      eliminarAutomatizacion: vi.fn(async () => undefined),
    } as unknown as ServicioQlik;
    const rutas = crearRutasPanelAutomatizaciones({
      resolverQlik: async () => qlik,
      resolverSesion: async () => ({
        tenantId: "tenant-1",
        usuarioId: "usuario-1",
        organizacionId: "organizacion-1",
        usuarioIdQlik: "andres-qlik-id",
      }),
      consultaTenant: {
        obtenerTenant: async () => ({
          host: "tenant.qlikcloud.com",
          automatizacionBaseIdQlik: "plantilla-1",
        }),
      },
      bloqueos: {} as never,
      idempotencia: {} as unknown as PuertoIdempotencia,
      outbox: {
        guardar: async () => undefined,
        listarPendientes: async () => [],
        marcarPublicado: async () => undefined,
        registrarFallo: async () => undefined,
      } satisfies PuertoOutbox,
      auditoria: { registrar: async () => undefined } as PuertoAuditoria,
    });

    const respuesta = await rutas.request("/desde-plantilla", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: "Nueva",
        propietarioIdQlik: "byron-qlik-id",
      }),
    });

    expect(respuesta.status).toBe(201);
    expect(cambiarPropietarioAutomatizacion).toHaveBeenLastCalledWith(
      "copia-1",
      "andres-qlik-id",
    );
  });
});
