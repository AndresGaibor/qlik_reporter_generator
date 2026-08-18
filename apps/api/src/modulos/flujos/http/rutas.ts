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
) {
  const rutas = new Hono();
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
