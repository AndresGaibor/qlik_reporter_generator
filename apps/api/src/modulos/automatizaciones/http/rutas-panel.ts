import { esquemaCrearDesdePlantilla } from "@qlik/contratos/automatizaciones";
import { esquemaIdQlik } from "@qlik/contratos/qlik";
import { type Context, Hono } from "hono";
import type { PuertoAuditoria } from "../../../nucleo/auditoria/puerto-auditoria.js";
import type { PuertoOutbox } from "../../../nucleo/eventos/puerto-outbox.js";
import { leerJson } from "../../../nucleo/http/leer-json.js";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { PuertoIdempotencia } from "../../../nucleo/idempotencia/puerto-idempotencia.js";
import { obtenerContextoSolicitud } from "../../../plataforma/contexto/contexto-solicitud.js";
import type { ServicioQlik } from "../../qlik/publico.js";
import { EjecutarReporte } from "../../reportes/aplicacion/ejecutar-reporte.js";
import { PreflightDataflow } from "../../reportes/aplicacion/preflight-dataflow.js";
import type { PuertoRepositorioReportes } from "../../reportes/aplicacion/puertos/puerto-repositorio-reportes.js";
import type { ResolucionBigQueryReporte } from "../../reportes/http/rutas-reportes-dataflow.js";
import { ConsultarPanelAutomatizaciones } from "../aplicacion/casos-de-uso/consultar-panel.js";
import { CrearAutomatizacionDesdePlantilla } from "../aplicacion/casos-de-uso/crear-desde-plantilla.js";
import type { PuertoBloqueoEjecucion } from "../aplicacion/puertos/puerto-bloqueo-ejecucion.js";
import type { PuertoConsultaTenantQlik } from "../aplicacion/puertos/puerto-consulta-tenant-qlik.js";

interface ContextoSesion {
  tenantId: string;
  usuarioId: string;
  organizacionId: string;
  usuarioIdQlik: string;
}

export interface DependenciasRutasPanel {
  resolverQlik(c: Context): Promise<ServicioQlik>;
  resolverSesion(c: Context): Promise<ContextoSesion>;
  consultaTenant: PuertoConsultaTenantQlik;
  bloqueos: PuertoBloqueoEjecucion;
  idempotencia: PuertoIdempotencia;
  outbox: PuertoOutbox;
  auditoria: PuertoAuditoria;
  repositorioReportes: PuertoRepositorioReportes;
  resolverBigQueryReporte(c: Context): Promise<ResolucionBigQueryReporte>;
}

export function crearRutasPanelAutomatizaciones(
  dependencias: DependenciasRutasPanel,
) {
  const rutas = new Hono();

  rutas.get("/", async (c) => {
    const qlik = await dependencias.resolverQlik(c);
    const espacioId = c.req.query("espacioId")?.trim() || undefined;
    const q =
      c.req.query("q")?.trim() || c.req.query("busqueda")?.trim() || undefined;
    const incluirBase = c.req.query("incluirBase") === "true";

    let lista = await new ConsultarPanelAutomatizaciones(qlik).listar(
      espacioId,
    );

    if (!incluirBase) {
      try {
        const sesion = await dependencias.resolverSesion(c);
        const tenant = await dependencias.consultaTenant.obtenerTenant(
          sesion.tenantId,
        );
        if (tenant?.automatizacionBaseIdQlik) {
          lista = lista.filter(
            (auto) => auto.id !== tenant.automatizacionBaseIdQlik,
          );
        }
      } catch {
        // Ignorar si no hay sesión
      }
    }

    if (q) {
      const qLower = q.toLowerCase();
      lista = lista.filter((auto) =>
        auto.nombre.toLowerCase().includes(qLower),
      );
    }

    return responderExito(c, lista);
  });

  rutas.get("/espacios", async (c) => {
    const qlik = await dependencias.resolverQlik(c);
    return responderExito(
      c,
      await new ConsultarPanelAutomatizaciones(qlik).listarEspacios(),
    );
  });

  /** Devuelve la configuración de automatización base del tenant activo */
  rutas.get("/configuracion-tenant", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const tenant = await dependencias.consultaTenant.obtenerTenant(
      sesion.tenantId,
    );
    return responderExito(c, {
      automatizacionBaseIdQlik: tenant?.automatizacionBaseIdQlik ?? null,
      automatizacionBaseNombre: tenant?.automatizacionBaseNombre ?? null,
    });
  });

  // Debe declararse antes de /:id para evitar que "desde-plantilla" sea un id.
  rutas.post("/desde-plantilla", async (c) => {
    const cuerpo = await leerJson(c);
    const claveEncabezado = c.req.header("idempotency-key")?.trim();

    const [qlik, sesion, bigQuery] = await Promise.all([
      dependencias.resolverQlik(c),
      dependencias.resolverSesion(c),
      dependencias.resolverBigQueryReporte(c),
    ]);

    // ── Resolver plantilla base desde el tenant ──────────────────────────────
    const tenant = await dependencias.consultaTenant.obtenerTenant(
      sesion.tenantId,
    );

    if (!tenant?.automatizacionBaseIdQlik) {
      return c.json(
        {
          exito: false,
          error: {
            mensaje:
              "El tenant no tiene configurada una automatización base. Configúrala en Administración → Tenants.",
            codigo: "SIN_AUTOMATIZACION_BASE",
          },
        },
        422,
      );
    }

    const cuerpoObj =
      typeof cuerpo === "object" && cuerpo !== null
        ? (cuerpo as Record<string, unknown>)
        : {};

    const autorIngresado =
      typeof cuerpoObj.autor === "string" ? cuerpoObj.autor.trim() : undefined;
    const nombreFinal =
      typeof cuerpoObj.nombre === "string" && cuerpoObj.nombre.trim()
        ? cuerpoObj.nombre.trim()
        : `Reporte ${String(cuerpoObj.flujoId ?? "Dataflow")}${autorIngresado ? ` ${autorIngresado}` : ""}`;

    const contextoSolicitud = obtenerContextoSolicitud(c);
    const entrada = esquemaCrearDesdePlantilla.parse({
      ...cuerpoObj,
      nombre: nombreFinal,
      ...(autorIngresado ? { autor: autorIngresado } : {}),
      // Qlik conserva el propietario de la plantilla al copiarla. Debe prevalecer
      // la identidad autenticada, no un identificador enviado por el cliente.
      propietarioIdQlik: sesion.usuarioIdQlik,
      plantillaIdQlik: tenant.automatizacionBaseIdQlik,
      ...(claveEncabezado ? { claveIdempotencia: claveEncabezado } : {}),
    });

    const resultado = await new CrearAutomatizacionDesdePlantilla(
      qlik,
      dependencias.idempotencia,
      dependencias.outbox,
      dependencias.auditoria,
      dependencias.repositorioReportes,
      new PreflightDataflow(qlik, bigQuery.estimador, {
        projectId: bigQuery.projectId,
        dataset: bigQuery.dataset,
      }),
    ).ejecutar(entrada, {
      ...sesion,
      idSolicitud: contextoSolicitud.idSolicitud,
      ip: contextoSolicitud.ip,
      agenteUsuario: contextoSolicitud.agenteUsuario,
    });
    return responderExito(c, resultado, 201);
  });

  rutas.get("/:id/workspace", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const qlik = await dependencias.resolverQlik(c);
    const automatizacion = await qlik.obtenerAutomatizacion(id);
    return responderExito(c, {
      id: automatizacion.id,
      nombre: automatizacion.name,
      workspace: automatizacion.workspace ?? {},
      schedules: automatizacion.schedules ?? [],
    });
  });

  rutas.put("/:id/workspace", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const cuerpo = (await c.req.json()) as {
      nombre?: string;
      workspace: Record<string, unknown>;
    };
    if (
      !cuerpo ||
      typeof cuerpo.workspace !== "object" ||
      cuerpo.workspace === null
    ) {
      return c.json(
        {
          exito: false,
          error: { mensaje: "El workspace debe ser un objeto JSON válido" },
        },
        400,
      );
    }
    const qlik = await dependencias.resolverQlik(c);
    const actualizada = await qlik.actualizarAutomatizacion(id, {
      ...(cuerpo.nombre?.trim() ? { name: cuerpo.nombre.trim() } : {}),
      workspace: cuerpo.workspace,
    });
    return responderExito(c, {
      id: actualizada.id,
      nombre: actualizada.name,
      workspace: actualizada.workspace ?? {},
    });
  });

  rutas.post("/:id/clonar", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const cuerpo = (await c.req.json().catch(() => ({}))) as {
      nombre?: string;
      espacioIdQlik?: string;
    };
    const qlik = await dependencias.resolverQlik(c);
    const original = await qlik.obtenerAutomatizacion(id);
    const nombreCopia = cuerpo.nombre?.trim() || `${original.name} (Copia)`;
    const copia = await qlik.copiarAutomatizacion(id, nombreCopia);
    if (cuerpo.espacioIdQlik) {
      await qlik.cambiarEspacioAutomatizacion(copia.id, cuerpo.espacioIdQlik);
    }
    return responderExito(c, { id: copia.id, nombre: nombreCopia }, 201);
  });

  rutas.get("/:id", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const qlik = await dependencias.resolverQlik(c);
    return responderExito(
      c,
      await new ConsultarPanelAutomatizaciones(qlik).obtener(id),
    );
  });

  rutas.post("/:id/ejecuciones", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const [qlik, sesion, bigQuery] = await Promise.all([
      dependencias.resolverQlik(c),
      dependencias.resolverSesion(c),
      dependencias.resolverBigQueryReporte(c),
    ]);
    const resultado = await new EjecutarReporte(
      qlik,
      dependencias.repositorioReportes,
      dependencias.bloqueos,
      { projectId: bigQuery.projectId, dataset: bigQuery.dataset },
    ).ejecutar({
      tenantId: sesion.tenantId,
      organizacionId: sesion.organizacionId,
      automatizacionIdQlik: id,
      usuarioId: sesion.usuarioId,
      tipo: "manual",
    });
    return responderExito(c, resultado, 201);
  });

  rutas.post("/:id/ejecuciones/:ejecucionId/detener", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const ejecucionId = esquemaIdQlik.parse(c.req.param("ejecucionId"));
    const qlik = await dependencias.resolverQlik(c);
    await qlik.detenerEjecucion(id, ejecucionId);
    return responderExito(c, { detenida: true as const });
  });

  return rutas;
}
