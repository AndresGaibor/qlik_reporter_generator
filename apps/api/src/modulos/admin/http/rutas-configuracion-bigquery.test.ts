import { describe, expect, it, vi } from "bun:test";
import { Hono } from "hono";
import type { RepositorioAdministracion } from "../aplicacion/puertos/repositorio-administracion.js";
import { crearRutasConfiguracionTenant } from "./rutas-configuracion-tenant.js";

const credenciales = {
  type: "service_account",
  project_id: "poc-bigquery-talend",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "sa@example.iam.gserviceaccount.com",
};

function crearApp(configurada = true) {
  const guardarBigQuery = vi.fn(async (_entrada: Record<string, unknown>) => ({
    configurada: true,
    id: "conexion-1",
    estado: "activo" as const,
    projectId: credenciales.project_id,
    dataset: "demo_lafavorita",
    gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
    clientEmail: credenciales.client_email,
    credencialesConfiguradas: true,
    mensajeError: null,
  }));
  const probarBigQuery = vi.fn(
    async (_organizacionId: string, _tenantQlikId: string) => ({
      exitoso: true,
      mensaje: "Conexión con BigQuery verificada",
    }),
  );
  const app = new Hono();
  app.route(
    "/api/admin",
    crearRutasConfiguracionTenant({
      repositorio: {} as RepositorioAdministracion,
      resolverContexto: async () => ({
        esSuperadmin: false,
        usuarioId: "usuario-1",
        membresias: [
          {
            organizacionId: "org-1",
            organizacionNombre: "Empresa",
            rol: "admin",
          },
        ],
      }),
      resolverQlik: async () => ({}) as never,
      obtenerBigQuery: async () =>
        configurada
          ? {
              configurada: true,
              id: "conexion-1",
              estado: "activo" as const,
              projectId: credenciales.project_id,
              dataset: "demo_lafavorita",
              gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
              clientEmail: credenciales.client_email,
              credencialesConfiguradas: true,
              mensajeError: null,
            }
          : { configurada: false, credencialesConfiguradas: false },
      guardarBigQuery,
      probarBigQuery,
    } as never),
  );
  return { app, guardarBigQuery, probarBigQuery };
}
describe("configuración BigQuery administrativa", () => {
  it("devuelve una configuración saneada", async () => {
    const { app } = crearApp();
    const respuesta = await app.request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-q1/bigquery",
    );
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.datos.projectId).toBe("poc-bigquery-talend");
    expect(cuerpo.datos.credencialesConfiguradas).toBe(true);
    expect(cuerpo.datos.gcsUri).toBe("gs://bkt_dwh/POCs/TalendDescargados/");
    expect(JSON.stringify(cuerpo)).not.toContain("PRIVATE KEY");
  });

  it("deriva proyecto y correo del JSON al guardar", async () => {
    const { app, guardarBigQuery } = crearApp();
    const respuesta = await app.request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-q1/bigquery",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: "demo_lafavorita",
          gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
          credencialesJson: JSON.stringify(credenciales),
        }),
      },
    );
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(guardarBigQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        organizacionId: "org-1",
        tenantQlikId: "tenant-q1",
        projectId: "poc-bigquery-talend",
        clientEmail: "sa@example.iam.gserviceaccount.com",
        dataset: "demo_lafavorita",
      }),
    );
    expect(JSON.stringify(cuerpo)).not.toContain("PRIVATE KEY");
  });

  it("conserva las credenciales existentes al editar solo el dataset", async () => {
    const { app, guardarBigQuery } = crearApp();
    const respuesta = await app.request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-q1/bigquery",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataset: "dataset_nuevo",
          gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
        }),
      },
    );

    expect(respuesta.status).toBe(200);
    expect(guardarBigQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "poc-bigquery-talend",
        clientEmail: "sa@example.iam.gserviceaccount.com",
        dataset: "dataset_nuevo",
        gcsUri: "gs://bkt_dwh/POCs/TalendDescargados/",
      }),
    );
    expect(guardarBigQuery.mock.calls[0]?.[0]).not.toHaveProperty(
      "credencialesJson",
    );
  });

  it("prueba la conexión BigQuery dentro del recurso del tenant", async () => {
    const { app, probarBigQuery } = crearApp();
    const respuesta = await app.request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-q1/bigquery/probar",
      { method: "POST" },
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(probarBigQuery).toHaveBeenCalledWith("org-1", "tenant-q1");
    expect(cuerpo.datos).toEqual({
      exitoso: true,
      mensaje: "Conexión con BigQuery verificada",
    });
  });

  it("exige el JSON en la primera configuración", async () => {
    const { app, guardarBigQuery } = crearApp(false);
    const respuesta = await app.request(
      "/api/admin/organizaciones/org-1/tenants-qlik/tenant-q1/bigquery",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: "demo_lafavorita" }),
      },
    );

    expect(respuesta.status).toBe(400);
    expect(guardarBigQuery).not.toHaveBeenCalled();
  });
});
