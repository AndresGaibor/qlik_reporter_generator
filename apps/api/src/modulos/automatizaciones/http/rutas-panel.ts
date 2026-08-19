import { esquemaIdQlik } from "@qlik/contratos/qlik";
import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import type { ServicioQlik } from "../../qlik/publico.js";
import { ConsultarPanelAutomatizaciones } from "../aplicacion/casos-de-uso/consultar-panel.js";
import type { PuertoConsultaTenantQlik } from "../aplicacion/puertos/puerto-consulta-tenant-qlik.js";

interface ContextoSesion {
  tenantId: string;
  usuarioId: string;
  organizacionId: string;
  usuarioIdQlik: string;
  esSuperadmin?: boolean;
  roles?: Array<"admin" | "usuario">;
}

export interface DependenciasRutasPanel {
  resolverQlik(c: Context): Promise<ServicioQlik>;
  resolverSesion(c: Context): Promise<ContextoSesion>;
  consultaTenant: PuertoConsultaTenantQlik;
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

  rutas.get("/:id/workspace", async (c) => {
    const sesion = await dependencias.resolverSesion(c);
    const esAdmin =
      sesion.esSuperadmin === true || sesion.roles?.includes("admin") === true;
    if (!esAdmin) {
      return c.json(
        {
          exito: false,
          error: {
            mensaje: "Solo los administradores pueden consultar el workspace",
            codigo: "NO_AUTORIZADO",
          },
        },
        403,
      );
    }

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

  rutas.put("/:id/workspace", (c) =>
    c.json(
      {
        exito: false,
        error: {
          mensaje:
            "El workspace de Qlik Automate está disponible solo para lectura",
          codigo: "SOLO_LECTURA",
        },
      },
      405,
    ),
  );

  rutas.get("/:id", async (c) => {
    const id = esquemaIdQlik.parse(c.req.param("id"));
    const qlik = await dependencias.resolverQlik(c);
    return responderExito(
      c,
      await new ConsultarPanelAutomatizaciones(qlik).obtener(id),
    );
  });

  return rutas;
}
