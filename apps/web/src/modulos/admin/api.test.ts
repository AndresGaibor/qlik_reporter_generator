import { clienteApi } from "@/compartido/api/cliente";
import { afterEach, expect, test, vi } from "vitest";
import {
  listarAutomatizacionesParaAdmin,
  probarConfiguracionBigQuery,
  recrearWorkerTenant,
} from "./api";

afterEach(() => vi.restoreAllMocks());

test("lista automatizaciones técnicas fuera de la API local de reportes", async () => {
  const get = vi.spyOn(clienteApi, "get").mockResolvedValue([]);

  await listarAutomatizacionesParaAdmin();

  expect(get).toHaveBeenCalledWith("/qlik/automatizaciones", {
    parametros: { incluirBase: "true" },
  });
});

test("recrea un worker sin enviar identidad Qlik desde el cliente", async () => {
  const post = vi.spyOn(clienteApi, "post").mockResolvedValue({});

  await recrearWorkerTenant("org/1", "tenant/1", "worker/1");

  expect(post).toHaveBeenCalledWith(
    "/admin/organizaciones/org%2F1/tenants-qlik/tenant%2F1/workers/worker%2F1/recrear",
  );
  expect(JSON.stringify(post.mock.calls[0])).not.toContain("usuarioIdQlik");
});

test("prueba BigQuery por organización y tenant sin usar destinos legacy", async () => {
  const post = vi.spyOn(clienteApi, "post").mockResolvedValue({
    exitoso: true,
    mensaje: "Conexión con BigQuery verificada",
  });

  await probarConfiguracionBigQuery("org/1", "tenant/1");

  expect(post).toHaveBeenCalledWith(
    "/admin/organizaciones/org%2F1/tenants-qlik/tenant%2F1/bigquery/probar",
  );
});
