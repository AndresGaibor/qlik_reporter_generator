import { esquemaClonarDataflowBase } from "@qlik/contratos/flujos";
import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";

export interface DependenciasClonadoDataflow {
  resolverSesion(c: Context): Promise<{ tenantId: string }>;
  obtenerTenant(tenantId: string): Promise<{
    dataflowBaseIdQlik?: string | null;
    dataflowBaseNombre?: string | null;
  } | null>;
  resolverQlik(c: Context): Promise<{
    listarFlujos(): Promise<
      Array<{
        id: string;
        appId?: string;
        name: string;
        spaceId?: string;
        description?: string;
      }>
    >;
    copiarDataflow(
      appId: string,
      nombre: string,
      opciones?: { espacioId?: string; descripcion?: string },
    ): Promise<unknown>;
  }>;
}

export function crearRutasClonadoDataflow(
  dependencias: DependenciasClonadoDataflow,
) {
  const rutas = new Hono();

  rutas.get("/plantilla-base", async (c) => {
    const tenant = await obtenerTenantDataflow(c, dependencias);
    if (!tenant?.dataflowBaseIdQlik) {
      return c.json(
        {
          exito: false,
          error: {
            codigo: "SIN_DATAFLOW_BASE",
            mensaje: "No hay un Dataflow base configurado para este entorno",
          },
        },
        422,
      );
    }
    return responderExito(c, {
      id: tenant.dataflowBaseIdQlik,
      nombre: tenant.dataflowBaseNombre || "Dataflow base",
    });
  });

  rutas.post("/desde-plantilla", async (c) => {
    const entrada = esquemaClonarDataflowBase.parse(await c.req.json());
    const tenant = await obtenerTenantDataflow(c, dependencias);
    if (!tenant?.dataflowBaseIdQlik) {
      return c.json(
        {
          exito: false,
          error: {
            codigo: "SIN_DATAFLOW_BASE",
            mensaje: "No hay un Dataflow base configurado para este entorno",
          },
        },
        422,
      );
    }
    const qlik = await dependencias.resolverQlik(c);
    const flujosDisponibles = await qlik.listarFlujos();
    const plantillaDisponible = flujosDisponibles.find(
      (flujo) =>
        flujo.id === tenant.dataflowBaseIdQlik ||
        (tenant.dataflowBaseNombre &&
          flujo.name.trim().toLocaleLowerCase("es") ===
            tenant.dataflowBaseNombre.trim().toLocaleLowerCase("es")),
    );
    if (!plantillaDisponible) {
      return c.json(
        {
          exito: false,
          error: {
            codigo: "DATAFLOW_BASE_NO_DISPONIBLE_EN_TENANT",
            mensaje:
              "La plantilla configurada no pertenece al entorno Qlik activo o ya no está disponible. Activa este entorno en Qlik y vuelve a seleccionar la plantilla en Configuración.",
          },
        },
        404,
      );
    }
    return responderExito(
      c,
      await qlik.copiarDataflow(
        plantillaDisponible.appId ?? plantillaDisponible.id,
        entrada.nombre,
        {
          espacioId: plantillaDisponible.spaceId,
          descripcion: plantillaDisponible.description,
        },
      ),
      201,
    );
  });

  return rutas;
}

async function obtenerTenantDataflow(
  c: Context,
  dependencias: DependenciasClonadoDataflow,
) {
  const sesion = await dependencias.resolverSesion(c);
  return dependencias.obtenerTenant(sesion.tenantId);
}
