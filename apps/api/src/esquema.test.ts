import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as esquema from "./plataforma/persistencia/esquema.js";
import {
  auditoriaEventos,
  automatizacionesPersonalesQlik,
  configuracionesOauthQlik,
  credencialesQlik,
  ejecucionesReportes,
  identidadesQlik,
  jobsBigQueryEjecucion,
  membresiasOrganizacion,
  organizaciones,
  resultadosEjecucionesReportes,
  sesionesUsuario,
  solicitudesIdempotentes,
  tenantsQlik,
  usuarios,
} from "./plataforma/persistencia/esquema.js";

function colNames(table: ReturnType<typeof getTableConfig>) {
  return table.columns.map((c) => c.name);
}

function idxNames(table: ReturnType<typeof getTableConfig>) {
  return table.indexes.map((i) => (i.config as { name: string }).name);
}

describe("Esquema Drizzle", () => {
  it("organizaciones tiene las columnas esperadas", () => {
    const cols = colNames(getTableConfig(organizaciones));
    expect(cols).toContain("id");
    expect(cols).toContain("nombre");
    expect(cols).toContain("estado");
    expect(cols).toContain("creado_en");
    expect(cols).toContain("actualizado_en");
  });

  it("usuarios tiene las columnas esperadas", () => {
    const cols = colNames(getTableConfig(usuarios));
    expect(cols).toContain("id");
    expect(cols).toContain("nombre");
    expect(cols).toContain("correo");
    expect(cols).toContain("estado");
    expect(cols).toContain("es_superadmin");
  });

  it("membresiasOrganizacion solo permite admin o usuario", () => {
    const config = getTableConfig(membresiasOrganizacion);
    const cols = colNames(config);
    expect(cols).toContain("organizacion_id");
    expect(cols).toContain("usuario_id");
    expect(cols).toContain("rol");
    const checks = config.checks as unknown as Array<{
      name: string;
      value: { queryChunks: Array<{ value?: string[] }> };
    }>;
    const rolCheck = checks.find(
      (check) => check.name === "membresias_rol_check",
    );
    const definicion = (rolCheck?.value.queryChunks ?? [])
      .flatMap((chunk) => chunk.value ?? [])
      .join("");
    expect(definicion).toContain("'admin'");
    expect(definicion).toContain("'usuario'");
    expect(definicion).not.toContain("'administrador'");
    expect(definicion).not.toContain("'editor'");
    expect(definicion).not.toContain("'auditor'");
  });

  it("tenantsQlik tiene las columnas esperadas", () => {
    const cols = colNames(getTableConfig(tenantsQlik));
    expect(cols).toContain("tenant_id_qlik");
    expect(cols).toContain("host");
    expect(cols).toContain("estado");
    expect(cols).toContain("es_principal");
    expect(idxNames(getTableConfig(tenantsQlik))).toContain(
      "uq_tenant_principal_por_organizacion",
    );
  });

  it("configuracionesOauthQlik protege secretos por tenant", () => {
    const config = getTableConfig(configuracionesOauthQlik);
    const cols = colNames(config);
    expect(cols).toContain("tenant_qlik_id");
    expect(cols).toContain("cliente_id");
    expect(cols).toContain("cliente_secreto_cifrado");
    expect(cols).toContain("secreto_sufijo");
    expect(cols).toContain("scopes");
    expect(cols).toContain("estado");
    expect(cols).toContain("verificada_en");
    expect(cols).toContain("ultimo_error");
    expect(idxNames(config)).toContain("uq_configuracion_oauth_por_tenant");
  });

  it("la migración inicial conserva las tablas y restricciones finales", async () => {
    const contenido = await Bun.file(
      new URL("../drizzle/0000_tan_zeigeist.sql", import.meta.url),
    ).text();

    expect(contenido).toContain('CREATE TABLE "app_config"');
    expect(contenido).toContain('CREATE TABLE "conexiones_destino"');
    expect(contenido).toContain("\"tipo\" = 'bigquery'");
    expect(contenido).toContain('CREATE TABLE "ejecuciones_reportes"');
    expect(contenido).toContain("\"tipo_ejecucion\" = 'manual'");
  });

  it("la migración forward elimina residuos físicos y normaliza roles", async () => {
    const contenido = await Bun.file(
      new URL("../drizzle/0001_spooky_marvel_apes.sql", import.meta.url),
    ).text();

    for (const tabla of [
      "automatizaciones_qlik_cache",
      "espacios_qlik_cache",
      "flujos_qlik_cache",
      "intentos_oauth_qlik",
      "eventos_outbox",
      "_migrations_lock",
      "configuracion_espacios_visibles",
      "configuraciones_plataforma",
      "espacios_visibles_usuario_final",
      "secretos_conexion_destino",
    ]) {
      expect(contenido).toContain(`DROP TABLE IF EXISTS "${tabla}"`);
    }
    for (const columna of [
      "automatizacion_plantilla_modo_1_id_qlik",
      "automatizacion_plantilla_modo_1_nombre",
      "automatizacion_plantilla_modo_2_id_qlik",
      "automatizacion_plantilla_modo_2_nombre",
    ]) {
      expect(contenido).toContain(`DROP COLUMN IF EXISTS "${columna}"`);
    }
    expect(contenido).toContain('DROP COLUMN IF EXISTS "probada_en"');
    expect(contenido).toContain("\"rol\" = 'admin'");
    expect(contenido).toContain("\"rol\" = 'usuario'");
    expect(contenido).toContain("\"rol\" IN ('admin', 'usuario')");
    expect(contenido).toContain(
      'DELETE FROM "sesiones_usuario" WHERE "revocada_en" IS NOT NULL OR "expira_en" <= NOW()',
    );
    expect(contenido).toContain(
      'DELETE FROM "solicitudes_idempotentes" WHERE "expira_en" <= NOW()',
    );
  });

  it("la segunda migración retira campos redundantes del reporte", async () => {
    const directorio = new URL("../drizzle/", import.meta.url);
    const archivo = (await readdir(directorio)).find(
      (nombre) => nombre.startsWith("0002_") && nombre.endsWith(".sql"),
    );
    expect(archivo).toBeDefined();
    const contenido = await Bun.file(
      new URL(`../drizzle/${archivo}`, import.meta.url),
    ).text();
    for (const columna of [
      "destino_proveedor",
      "destino_id_externo",
      "destino_nombre_snapshot",
      "clave_idempotencia",
    ]) {
      expect(contenido).toContain(`DROP COLUMN \"${columna}\"`);
    }
    expect(contenido).toContain('DROP COLUMN "tipo_ejecucion"');
  });

  it("identidadesQlik tiene las columnas esperadas", () => {
    const cols = colNames(getTableConfig(identidadesQlik));
    expect(cols).toContain("usuario_id_qlik");
    expect(cols).toContain("tenant_qlik_id");
  });

  it("credencialesQlik tiene columnas de token", () => {
    const cols = colNames(getTableConfig(credencialesQlik));
    expect(cols).toContain("token_acceso_cifrado");
    expect(cols).toContain("token_refresco_cifrado");
    expect(cols).toContain("scopes");
    expect(cols).toContain("token_expira_en");
  });

  it("sesionesUsuario tiene indices definidos", () => {
    const idxs = idxNames(getTableConfig(sesionesUsuario));
    expect(idxs).toContain("idx_sesiones_usuario_usuario");
    expect(idxs).toContain("idx_sesiones_usuario_expira");
  });

  it("no exporta reportes porque el catálogo vive en Qlik", () => {
    expect(esquema).not.toHaveProperty("reportes");
  });

  it("automatizaciones personales son únicas por usuario y tenant", () => {
    const config = getTableConfig(automatizacionesPersonalesQlik);
    expect(colNames(config)).toEqual(
      expect.arrayContaining([
        "usuario_id",
        "tenant_qlik_id",
        "automatizacion_id_qlik",
      ]),
    );
    const constraint = config.uniqueConstraints.find(
      (item) =>
        item.name === "automatizaciones_personales_usuario_tenant_unique",
    );
    expect(constraint).toBeDefined();
    expect(constraint?.columns.map((column) => column.name)).toEqual([
      "usuario_id",
      "tenant_qlik_id",
    ]);
  });

  it("mantiene la cadena de migraciones sin entradas huérfanas", async () => {
    const migraciones = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
    });
    const journal = JSON.parse(
      await Bun.file(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
      ).text(),
    ) as { entries: Array<{ tag: string }> };
    expect(migraciones).toHaveLength(journal.entries.length);
    expect(journal.entries.map(({ tag }) => tag)).toEqual([
      "0000_tan_zeigeist",
      "0001_spooky_marvel_apes",
      "0002_absent_thing",
      "0003_even_spectrum",
      "0004_nice_speed_demon",
      "0005_separar_reportes_workers",
      "0006_persistir_ejecuciones_dataflow",
      "0007_trazabilidad_bigquery_jobs",
      "0008_optimal_prism",
      "0009_perpetual_deathstrike",
      "0010_young_thaddeus_ross",
      "0011_compartir_descargas",
      "0012_compartir_reportes",
      "0013_fuzzy_callisto",
      "0014_reconciliar_compartir_joseph",
    ]);
  });

  it("ejecucionesReportes conserva la auditoría técnica de cada run y columnas de trazabilidad BigQuery", () => {
    const cols = colNames(getTableConfig(ejecucionesReportes));
    expect(cols).toEqual([
      "id",
      "organizacion_id",
      "tenant_qlik_id",
      "ejecutado_por_usuario_id",
      "ejecutado_por_nombre",
      "ejecutado_por_correo",
      "origen_ejecucion",
      "automatizacion_personal_id",
      "flujo_id_qlik",
      "flujo_nombre_snapshot",
      "flujo_espacio_id_qlik",
      "automatizacion_id_qlik",
      "run_id_qlik",
      "hash_dataflow_sha256",
      "script_dataflow",
      "sql_bigquery_compilado",
      "script_exportacion",
      "uri_base_gcs",
      "estado",
      "cancelacion_solicitada_en",
      "cancelada_por_usuario_id",
      "motivo_detencion",
      "version_compilador",
      "etapa_error",
      "mensaje_error",
      "job_id_principal_bigquery",
      "bigquery_project_id",
      "bigquery_location",
      "qlik_iniciado_en",
      "bigquery_iniciado_en",
      "bigquery_finalizado_en",
      "gcs_finalizado_en",
      "filas_exportadas",
      "fuente_filas_exportadas",
      "total_bytes_processed",
      "total_bytes_billed",
      "total_slot_ms",
      "duracion_bigquery_ms",
      "tarifa_consulta_usd_por_tib_aplicada",
      "costo_bigquery_usd",
      "moneda_costo",
      "version_formula_costo",
      "metricas_calculadas_en",
      "iniciado_en",
      "finalizado_en",
      "creado_en",
      "actualizado_en",
    ]);
    expect(cols).not.toContain("configuracion_id");
    expect(cols).not.toContain("tipo_ejecucion");
  });

  it("resultadosEjecucionesReportes conserva el snapshot semántico del resultado", () => {
    const config = getTableConfig(resultadosEjecucionesReportes);
    expect(colNames(config)).toEqual([
      "ejecucion_reporte_id",
      "estado",
      "tamano_almacenado_bytes",
      "objetos_fuente",
      "partes_descarga",
      "maximo_filas_por_archivo_aplicado",
      "disponible_en",
      "eliminado_en",
      "eliminado_por_usuario_id",
      "motivo_eliminacion",
      "actualizado_en",
    ]);
    const checks = config.checks as unknown as Array<{ name: string }>;
    expect(checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "resultados_ejecuciones_reportes_estado_check",
        "resultados_ejecuciones_reportes_metricas_check",
      ]),
    );
  });

  it("auditoriaEventos tiene columnas de auditoria", () => {
    const cols = colNames(getTableConfig(auditoriaEventos));
    expect(cols).toContain("accion");
    expect(cols).toContain("resultado");
    expect(cols).toContain("datos_anteriores");
    expect(cols).toContain("datos_nuevos");
  });

  it("solicitudesIdempotentes conserva clave, hash y respuesta", () => {
    const cols = colNames(getTableConfig(solicitudesIdempotentes));
    expect(cols).toContain("clave");
    expect(cols).toContain("hash_solicitud");
    expect(cols).toContain("respuesta");
  });

  it("no exporta programacionesAutomatizacion (legacy)", () => {
    expect(esquema).not.toHaveProperty("programacionesAutomatizacion");
  });

  it("no exporta conexionesOrigen (legacy)", () => {
    expect(esquema).not.toHaveProperty("conexionesOrigen");
  });

  it("no exporta destinosCache (legacy)", () => {
    expect(esquema).not.toHaveProperty("destinosCache");
  });

  it("no exporta caches Qlik, intentos OAuth ni Outbox sin consumidores", () => {
    for (const nombre of [
      "espaciosQlikCache",
      "flujosQlikCache",
      "automatizacionesQlikCache",
      "intentosOauthQlik",
      "eventosOutbox",
    ]) {
      expect(esquema).not.toHaveProperty(nombre);
    }
  });

  it("tenantsQlik no tiene columnas destinoApi ni destinoBaseDatos", () => {
    const cols = colNames(getTableConfig(tenantsQlik));
    expect(cols).not.toContain("destino_api_url");
    expect(cols).not.toContain("destino_api_key_cifrada");
    expect(cols).not.toContain("destino_base_datos");
  });

  it("ejecucionesReportes no persiste tipo de ejecución desde que solo existe manual", () => {
    const cols = colNames(getTableConfig(ejecucionesReportes));
    expect(cols).not.toContain("tipo_ejecucion");
  });

  it("jobsBigQueryEjecucion tiene todas las columnas de metadata de job BigQuery", () => {
    const cols = colNames(getTableConfig(jobsBigQueryEjecucion));
    expect(cols).toEqual([
      "id",
      "ejecucion_reporte_id",
      "job_id",
      "parent_job_id",
      "project_id",
      "location",
      "tipo",
      "estado",
      "creation_time",
      "start_time",
      "end_time",
      "duracion_ms",
      "total_bytes_processed",
      "total_bytes_billed",
      "total_slot_ms",
      "cache_hit",
      "statement_type",
      "error_reason",
      "error_message",
      "metadata_json",
      "creado_en",
      "actualizado_en",
    ]);
  });

  it("jobsBigQueryEjecucion tiene métricas como TEXT para evitar pérdida de precisión > Number.MAX_SAFE_INTEGER", () => {
    const config = getTableConfig(jobsBigQueryEjecucion);
    for (const name of [
      "total_bytes_processed",
      "total_bytes_billed",
      "total_slot_ms",
    ]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col).toBeDefined();
      const colDataType = col?.dataType as string | undefined;
      expect(colDataType).toBe("string");
    }
  });

  it("jobsBigQueryEjecucion tiene constraint única por projectId + location + jobId", () => {
    const config = getTableConfig(jobsBigQueryEjecucion);
    const uq = config.uniqueConstraints.find(
      (uc) => uc.name === "uq_job_project_location",
    );
    expect(uq).toBeDefined();
    expect(uq?.columns.map((c) => c.name)).toEqual([
      "project_id",
      "location",
      "job_id",
    ]);
  });

  it("jobsBigQueryEjecucion tiene índices en ejecucionReporteId, jobId y estado", () => {
    const idxs = idxNames(getTableConfig(jobsBigQueryEjecucion));
    expect(idxs).toContain("idx_jobs_ejecucion_reportes");
    expect(idxs).toContain("idx_jobs_job_id");
    expect(idxs).toContain("idx_jobs_estado");
  });
});
