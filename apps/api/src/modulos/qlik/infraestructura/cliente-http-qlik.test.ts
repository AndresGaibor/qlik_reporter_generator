import { type Mock, describe, expect, it, vi } from "bun:test";
import { ClienteHttpQlik } from "./cliente-http-qlik.js";
import { ErrorApiQlik } from "./error-api-qlik.js";

function respuestaJson(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = Mock<
  (input: string | URL | Request, init?: RequestInit) => Promise<Response>
>;

describe("ClienteHttpQlik", () => {
  it("extrae data en endpoints paginados", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({
        data: [{ id: "espacio-1", name: "Operaciones", type: "shared" }],
      }),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    const espacios = await cliente.listarEspacios({ limit: 100 });

    expect(espacios).toHaveLength(1);
    expect(espacios[0]?.name).toBe("Operaciones");
    const llamada = fetchFn.mock.calls[0] as unknown[];
    const url = new URL(String(llamada[0]));
    expect(url.pathname).toBe("/api/v1/spaces");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("conserva el recurso directo al consultar por id", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({
        id: "usuario-1",
        name: "Andres",
        email: "a@example.com",
      }),
    );
    const cliente = new ClienteHttpQlik(
      "https://tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    const usuario = await cliente.obtenerUsuario("usuario-1", "name,email");

    expect(usuario.name).toBe("Andres");
    const llamada = fetchFn.mock.calls[0] as unknown[];
    const url = new URL(String(llamada[0]));
    expect(url.searchParams.get("fields")).toBe("name,email");
  });

  it("ejecuta una automatización con context api", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({ id: "ejecucion-1" }, 201),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    await expect(
      cliente.ejecutarAutomatizacion("automatizacion-1"),
    ).resolves.toEqual({
      runId: "ejecucion-1",
    });
    const llamada = fetchFn.mock.calls[0] as unknown[];
    const opciones = llamada[1] as RequestInit;
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(String(opciones.body))).toEqual({ context: "api" });
  });

  it("solo lista Dataflows cuya descripcion contiene qlik generator", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({
        data: [
          {
            id: "incluido-1",
            resourceId: "flujo-1",
            name: "Ventas",
            description: "Creado por QLIK GENERATOR para ventas",
            resourceSubType: "qix-df",
            resourceAttributes: {
              sourceSystemId: "QIX-DF_app-real-1",
            },
          },
          {
            id: "incluido-2",
            name: "Inventario",
            resourceAttributes: {
              usage: "DATAFLOW_PREP",
              description: "Reporte de qlik generator",
            },
          },
          {
            id: "excluido-sin-marcador",
            name: "Dataflow manual",
            description: "Creado manualmente",
            resourceSubType: "qix-df",
          },
          {
            id: "excluido-marcador-en-nombre",
            name: "Qlik Generator sin descripcion",
            description: "",
            resourceSubType: "qix-df",
          },
          {
            id: "excluido-no-dataflow",
            name: "Aplicacion",
            description: "qlik generator",
            resourceSubType: "qix-app",
          },
        ],
      }),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    const flujos = await cliente.listarFlujos();

    expect(flujos.map((flujo) => flujo.id)).toEqual(["flujo-1", "incluido-2"]);
    expect(flujos[0]?.appId).toBe("app-real-1");
  });

  it("valida el script mediante el endpoint nativo de Qlik", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({
        Errors: [{ Msg: "Unexpected token", Tab: 2, Line: 7, Column: 3 }],
        Warnings: [{ Msg: "Deprecated function", Line: 4 }],
      }),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    const resultado = await cliente.validarScriptApp("LOAD [id];");

    expect(resultado.errores[0]).toMatchObject({
      mensaje: "Unexpected token",
      pestana: 2,
      linea: 7,
      columna: 3,
    });
    expect(resultado.advertencias[0]?.mensaje).toBe("Deprecated function");
    const llamada = fetchFn.mock.calls[0] as unknown[];
    expect(new URL(String(llamada[0])).pathname).toBe(
      "/api/v1/apps/validatescript",
    );
    const opciones = llamada[1] as RequestInit;
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(String(opciones.body))).toEqual({ script: "LOAD [id];" });
  });

  it("copia el Dataflow con el formato exacto de Apps API", async () => {
    const fetchFn: FetchMock = vi.fn(async () =>
      respuestaJson({ attributes: { id: "copia-1", name: "Copia ventas" } }),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    await cliente.copiarDataflow("app-real-1", "Copia ventas", {
      espacioId: "space-1",
      descripcion: "qlik generator",
    });

    const llamada = fetchFn.mock.calls[0] as unknown[];
    expect(new URL(String(llamada[0])).pathname).toBe(
      "/api/v1/apps/app-real-1/copy",
    );
    const opciones = llamada[1] as RequestInit;
    expect(opciones.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(opciones.body))).toEqual({
      attributes: {
        name: "Copia ventas",
        usage: "DATAFLOW_PREP",
        spaceId: "space-1",
        description: "qlik generator",
      },
    });
  });

  it("propaga estado, cuerpo y trace id de Qlik", async () => {
    const fetchFn: FetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            traceId: "traza-qlik",
            errors: [{ title: "Forbidden" }],
          }),
          {
            status: 403,
            statusText: "Forbidden",
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const cliente = new ClienteHttpQlik(
      "tenant.eu.qlikcloud.com",
      "token",
      fetchFn as unknown as typeof fetch,
    );

    const error = await cliente
      .listarAutomatizaciones()
      .catch((causa) => causa);

    expect(error).toBeInstanceOf(ErrorApiQlik);
    expect(error.estadoHttp).toBe(403);
    expect(error.trazaId).toBe("traza-qlik");
    expect(JSON.stringify(error.cuerpo)).toContain("Forbidden");
  });

  it("rechaza hosts no HTTPS", () => {
    expect(
      () => new ClienteHttpQlik("http://tenant.example.com", "token"),
    ).toThrow("HTTPS");
  });
});
