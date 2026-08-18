import { esquemaClonarDataflowBase } from "@qlik/contratos/flujos";
import { type Context, Hono } from "hono";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import { ListarFlujos } from "../aplicacion/casos-de-uso/listar-flujos.js";
import type { PuertoConsultaFlujos } from "../aplicacion/puertos/puerto-consulta-flujos.js";
import {
  resumenScriptNoDisponible,
  resumirDataflowParaUsuario,
} from "../aplicacion/resumir-dataflow.js";

export function crearRutasFlujos(
  resolverConsulta: (c: Context) => Promise<PuertoConsultaFlujos>,
  resolverQlik?: (
    c: Context,
  ) => Promise<import("../../qlik/publico.js").ServicioQlik>,
  dependenciasClonado?: {
    resolverSesion(c: Context): Promise<{ tenantId: string }>;
    obtenerTenant(tenantId: string): Promise<{
      dataflowBaseIdQlik?: string | null;
      dataflowBaseNombre?: string | null;
    } | null>;
  },
) {
  const rutas = new Hono();
  rutas.get("/plantilla-base", async (c) => {
    if (!dependenciasClonado) {
      return c.json(
        {
          exito: false,
          error: { mensaje: "Configuración de Dataflow base no disponible" },
        },
        503,
      );
    }
    const sesion = await dependenciasClonado.resolverSesion(c);
    const tenant = await dependenciasClonado.obtenerTenant(sesion.tenantId);
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
    if (!resolverQlik || !dependenciasClonado) {
      return c.json(
        { exito: false, error: { mensaje: "Copia de Dataflow no disponible" } },
        503,
      );
    }
    const entrada = esquemaClonarDataflowBase.parse(await c.req.json());
    const sesion = await dependenciasClonado.resolverSesion(c);
    const tenant = await dependenciasClonado.obtenerTenant(sesion.tenantId);
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
    const qlik = await resolverQlik(c);
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
  rutas.get("/", async (c) => {
    const consulta = await resolverConsulta(c);
    const espacioId = c.req.query("espacioId")?.trim() || undefined;
    const q =
      c.req.query("q")?.trim() || c.req.query("busqueda")?.trim() || undefined;

    let lista = await new ListarFlujos(consulta).ejecutar(espacioId);
    if (q) {
      const qLower = q.toLowerCase();
      lista = lista.filter((flujo) =>
        flujo.nombre.toLowerCase().includes(qLower),
      );
    }

    return responderExito(c, lista);
  });

  rutas.get("/:id/resumen", async (c) => {
    if (!resolverQlik) {
      return c.json(
        {
          exito: false,
          error: { mensaje: "Cliente Qlik no configurado para flujos" },
        },
        500,
      );
    }
    const id = c.req.param("id");
    const qlik = await resolverQlik(c);
    const flujo = (await qlik.listarFlujos()).find((item) => item.id === id);
    const nombre = flujo?.name || "Dataflow";
    try {
      const { script } = await qlik.obtenerScriptApp(id, "current");
      const validacion = await qlik.validarScriptApp(script);
      return responderExito(
        c,
        resumirDataflowParaUsuario({
          flujoId: id,
          nombre,
          script,
          erroresQlik: validacion.errores.map(formatearValidacionQlik),
          advertenciasQlik: validacion.advertencias.map(
            formatearValidacionQlik,
          ),
        }),
      );
    } catch (error: unknown) {
      return responderExito(
        c,
        resumenScriptNoDisponible(
          id,
          nombre,
          error instanceof Error
            ? error.message
            : "No se pudo obtener el script desde Qlik Cloud",
        ),
      );
    }
  });

  rutas.get("/:id/script", async (c) => {
    if (!resolverQlik) {
      return c.json(
        {
          exito: false,
          error: { mensaje: "Cliente Qlik no configurado para flujos" },
        },
        500,
      );
    }
    const id = c.req.param("id");
    const qlik = await resolverQlik(c);
    try {
      const resultadoScript = await qlik.obtenerScriptApp(id, "current");
      return responderExito(c, {
        id,
        script: resultadoScript.script,
        versionMessage: resultadoScript.versionMessage ?? null,
      });
    } catch (err: unknown) {
      return c.json(
        {
          exito: false,
          error: {
            mensaje:
              err instanceof Error
                ? err.message
                : "No se pudo recuperar el script del Dataflow desde Qlik Cloud",
          },
        },
        404,
      );
    }
  });

  return rutas;
}

function formatearValidacionQlik(mensaje: {
  mensaje: string;
  pestana?: number;
  linea?: number;
  columna?: number;
  informacion?: string;
}): string {
  const ubicacion = [
    mensaje.pestana !== undefined ? `pestaña ${mensaje.pestana}` : undefined,
    mensaje.linea !== undefined ? `línea ${mensaje.linea}` : undefined,
    mensaje.columna !== undefined ? `columna ${mensaje.columna}` : undefined,
  ].filter(Boolean);
  return `${mensaje.mensaje}${ubicacion.length ? ` (${ubicacion.join(", ")})` : ""}${
    mensaje.informacion ? `: ${mensaje.informacion}` : ""
  }`;
}
