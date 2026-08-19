import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
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
  membresiasOrganizacion,
  organizaciones,
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

  it("reportes no persiste propiedad de Qlik Automate", () => {
    const cols = colNames(getTableConfig(esquema.reportes));
    expect(cols).toContain("flujo_id_qlik");
    expect(cols).toContain("estado");
    expect(cols).not.toContain("automatizacion_id_qlik");
    expect(cols).not.toContain("automatizacion_nombre_snapshot");
    for (const legacy of [
      "programar",
      "destino_proveedor",
      "destino_id_externo",
      "destino_nombre_snapshot",
      "clave_idempotencia",
    ]) {
      expect(cols).not.toContain(legacy);
    }
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
      migrationsFolder: new URL("../drizzle/", import.meta.url).pathname,
    });
    expect(migraciones).toHaveLength(6);
    const journal = JSON.parse(
      await Bun.file(
        new URL("../drizzle/meta/_journal.json", import.meta.url),
      ).text(),
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.map(({ tag }) => tag)).toEqual([
      "0000_tan_zeigeist",
      "0001_spooky_marvel_apes",
      "0002_absent_thing",
      "0003_even_spectrum",
      "0004_nice_speed_demon",
      "0005_separar_reportes_workers",
    ]);
  });

  it("ejecucionesReportes conserva la auditoría técnica de cada run", () => {
    const cols = colNames(getTableConfig(ejecucionesReportes));
    expect(cols).toEqual(
      expect.arrayContaining([
        "reporte_id",
        "flujo_id_qlik",
        "automatizacion_id_qlik",
        "ejecutado_por_usuario_id",
        "automatizacion_personal_id",
        "hash_dataflow_sha256",
        "script_dataflow",
        "sql_bigquery_compilado",
        "script_exportacion",
        "uri_base_gcs",
        "estado",
      ]),
    );
    expect(cols).not.toContain("configuracion_id");
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
});
