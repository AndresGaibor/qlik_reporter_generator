import { type Context, Hono } from "hono";
import { z } from "zod";
import { responderExito } from "../../../nucleo/http/respuestas.js";
import { crearClienteDestino } from "../aplicacion/fabrica-destinos.js";
import type { TipoDestino } from "../dominio/tipos-destino.js";

const esquemaCrearDestino = z.object({
  tipo: z.enum(["bigquery"]),
  nombre: z.string().min(1).max(255),
  config: z.record(z.unknown()),
});

const esquemaActualizarDestino = z.object({
  nombre: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  estado: z.enum(["activo", "error", "desconectado"]).optional(),
});

export function crearRutasDestinosGenericas(
  obtenerConexiones: (c: Context) => Promise<
    Array<{
      id: string;
      tipo: string;
      nombre: string;
      estado: string;
      mensajeError: string | null;
     config: Record<string, unknown>;
      secretoRefs: Record<string, unknown>;
       esPredeterminada: boolean;
    }>
  >,
  guardarConexion: (
    c: Context,
    conexion: {
      organizacionId: string;
      tipo: string;
      nombre: string;
      config: Record<string, unknown>;
      secretoRefs: Record<string, unknown>;
      esPredeterminada?: boolean;
    },
  ) => Promise<{ id: string }>,
  actualizarConexion: (
    c: Context,
    id: string,
    cambios: {
      nombre?: string;
      config?: Record<string, unknown>;
      estado?: string;
      mensajeError?: string | null;
    },
  ) => Promise<void>,
  eliminarConexion: (c: Context, id: string) => Promise<void>,
  obtenerConexion: (
    c: Context,
    id: string,
  ) => Promise<{
    id: string;
    tipo: string;
    nombre: string;
    estado: string;
    mensajeError: string | null;
    config: Record<string, unknown>;
      secretoRefs: Record<string, unknown>;
      esPredeterminada: boolean;
  } | null>,
  resolverOrganizacion?: (c: Context) => Promise<string>,
) {
  const rutas = new Hono();

  rutas.get("/", async (c) => {
    const conexiones = await obtenerConexiones(c);
    return responderExito(
      c,
      conexiones.map((conn) => ({
        id: conn.id,
        tipo: conn.tipo,
        nombre: conn.nombre,
        estado: conn.estado,
        mensajeError: conn.mensajeError,
        esPredeterminada: conn.esPredeterminada,
      })),
    );
  });

  rutas.post("/", async (c) => {
    const body = await c.req.json();
    const entrada = esquemaCrearDestino.parse(body);
    const orgId = resolverOrganizacion
      ? await resolverOrganizacion(c)
      : c.req.header("x-organizacion-id");
    if (!orgId) {
      return c.json({ success: false, error: "No se encontró la organización" }, 401);
    }
    const result = await guardarConexion(c, {
      organizacionId: orgId,
      tipo: entrada.tipo,
      nombre: entrada.nombre,
      config: entrada.config,
      secretoRefs: {},
      esPredeterminada: true,
    });
    return responderExito(c, { id: result.id }, 201);
  });

  rutas.get("/:id", async (c) => {
    const id = c.req.param("id");
    const conn = await obtenerConexion(c, id);
    if (!conn) {
      return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    }
    return responderExito(c, {
      id: conn.id,
      tipo: conn.tipo,
      nombre: conn.nombre,
      estado: conn.estado,
      mensajeError: conn.mensajeError,
    });
  });

  rutas.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const entrada = esquemaActualizarDestino.parse(body);
    await actualizarConexion(c, id, {
      nombre: entrada.nombre,
      config: entrada.config,
      estado: entrada.estado,
    });
    return responderExito(c, { actualizado: true });
  });

  rutas.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await eliminarConexion(c, id);
    return responderExito(c, { eliminado: true });
  });

  rutas.post("/:id/probar", async (c) => {
    const id = c.req.param("id");
    const conn = await obtenerConexion(c, id);
    if (!conn) {
      return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    }
    try {
      const cliente = crearClienteDestino({
        tipo: conn.tipo as TipoDestino,
        config: conn.config,
        secretoRefs: conn.secretoRefs,
      });
      if (cliente.probarConexion) {
        await cliente.probarConexion();
      }
      const capacidades = cliente.obtenerCapacidades();
      await actualizarConexion(c, id, {
        estado: "activo",
        mensajeError: null,
      });
      return responderExito(c, {
        exitoso: true,
        mensaje: "Conexión exitosa",
        capacidades,
      });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error desconocido";
      await actualizarConexion(c, id, {
        estado: "error",
        mensajeError: mensaje,
      });
      return responderExito(c, { exitoso: false, mensaje });
    }
  });

  rutas.get("/:id/capacidades", async (c) => {
    const id = c.req.param("id");
    const conn = await obtenerConexion(c, id);
    if (!conn) {
      return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    }
    const cliente = crearClienteDestino({
      tipo: conn.tipo as TipoDestino,
      config: conn.config,
      secretoRefs: conn.secretoRefs,
    });
    return responderExito(c, cliente.obtenerCapacidades());
  });

  rutas.get("/:id/recursos", async (c) => {
    const id = c.req.param("id");
    const conn = await obtenerConexion(c, id);
    if (!conn) {
      return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    }
    const cliente = crearClienteDestino({
      tipo: conn.tipo as TipoDestino,
      config: conn.config,
      secretoRefs: conn.secretoRefs,
    });
    const recursos = await cliente.listarRecursos();
    return responderExito(c, recursos);
  });

  rutas.get("/:id/recursos/:recursoId", async (c) => {
    const id = c.req.param("id");
    const recursoId = c.req.param("recursoId");
    const conn = await obtenerConexion(c, id);
    if (!conn) {
      return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    }
    const cliente = crearClienteDestino({
      tipo: conn.tipo as TipoDestino,
      config: conn.config,
      secretoRefs: conn.secretoRefs,
    });
    const recurso = await cliente.obtenerRecurso(recursoId);
    return responderExito(c, recurso);
  });

  rutas.get("/:id/recursos/:recursoId/preview", async (c) => {
    const conn = await obtenerConexion(c, c.req.param("id"));
    if (!conn) return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    const cliente = crearClienteDestino({ tipo: conn.tipo as TipoDestino, config: conn.config, secretoRefs: conn.secretoRefs });
    if (!cliente.obtenerVistaPrevia) return c.json({ success: false, error: "Preview no disponible" }, 400);
    const limite = Number(c.req.query("limite") ?? 20);
    return responderExito(c, await cliente.obtenerVistaPrevia(c.req.param("recursoId"), limite));
  });

  rutas.get("/:id/recursos/:recursoId/ddl", async (c) => {
    const conn = await obtenerConexion(c, c.req.param("id"));
    if (!conn) return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    const cliente = crearClienteDestino({ tipo: conn.tipo as TipoDestino, config: conn.config, secretoRefs: conn.secretoRefs });
    if (!cliente.obtenerDdl) return c.json({ success: false, error: "DDL no disponible" }, 400);
    return responderExito(c, { ddl: await cliente.obtenerDdl(c.req.param("recursoId")) });
  });

  rutas.post("/:id/estimar", async (c) => {
    const conn = await obtenerConexion(c, c.req.param("id"));
    if (!conn) return c.json({ success: false, error: "Conexión no encontrada" }, 404);
    const cliente = crearClienteDestino({
      tipo: conn.tipo as TipoDestino,
      config: conn.config,
      secretoRefs: conn.secretoRefs,
    });
    if (!cliente.estimarConsulta) {
      return c.json({ success: false, error: "Estimación de costos no disponible" }, 400);
    }
    const body = await c.req.json<{
      query?: string;
      recursoId?: string;
      columnas?: string[];
      fechaDesde?: string;
      fechaHasta?: string;
    }>();

    let sql = body.query;
    if (!sql && body.recursoId) {
      const configObj = (conn.config ?? {}) as Record<string, unknown>;
      const dataset = String(configObj.dataset ?? "");
      const project = String(configObj.projectId ?? "");
      const cols = body.columnas && body.columnas.length > 0 ? body.columnas.join(", ") : "*";
      const tablaFq = project && dataset ? `\`${project}.${dataset}.${body.recursoId}\`` : `\`${body.recursoId}\``;

      const condiciones: string[] = [];
      if (body.fechaDesde && body.fechaHasta && body.fechaDesde === body.fechaHasta) {
        condiciones.push(`Fecha = DATE("${body.fechaDesde}")`);
      } else {
        if (body.fechaDesde) condiciones.push(`Fecha >= DATE("${body.fechaDesde}")`);
        if (body.fechaHasta) condiciones.push(`Fecha <= DATE("${body.fechaHasta}")`);
      }

      const whereClause = condiciones.length > 0 ? ` WHERE ${condiciones.join(" AND ")}` : "";
      sql = `SELECT ${cols} FROM ${tablaFq}${whereClause}`;
    }

    if (!sql) return c.json({ success: false, error: "Consulta o recurso obligatorios" }, 400);

    try {
      const resultado = await cliente.estimarConsulta(sql);
      return responderExito(c, {
        ...resultado,
        queryGenerada: sql,
      });
    } catch (error) {
      return c.json({ success: false, error: (error as Error).message }, 400);
    }
  });

  return rutas;
}
