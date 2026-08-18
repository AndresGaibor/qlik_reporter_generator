import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./esquema.js";

class DbHolder {
  private _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
  private _client: ReturnType<typeof postgres> | null = null;

  private get connectionString() {
    const cs =
      process.env.DATABASE_URL ??
      "postgres://qlik_app:desarrollo@localhost:5432/qlik_automatizaciones";
    return cs;
  }

  get client() {
    if (!this._client) {
      this._client = postgres(this.connectionString);
    }
    return this._client;
  }

  get db() {
    if (!this._db) {
      this._db = drizzle(this.client, { schema });
    }
    return this._db;
  }

  async cerrar(): Promise<void> {
    if (!this._client) return;
    const cliente = this._client;
    this._client = null;
    this._db = null;
    await cliente.end({ timeout: 5 });
  }
}

const dbHolder = new DbHolder();
export const db = dbHolder.db;
export { dbHolder };
export type ConexionDb = typeof db;

export async function cerrarConexion(): Promise<void> {
  await dbHolder.cerrar();
}

const rutaEsquemaBase = resolve(process.cwd(), "sql/esquema-base.sql");

export function obtenerEsquemaBase(): string {
  return readFileSync(rutaEsquemaBase, "utf8");
}

export async function asegurarEsquemaTablas(): Promise<void> {
  await db.execute(sql`SET client_min_messages = 'WARNING'`);
  const resultado = await db.execute<{ existe: boolean }>(sql`
    SELECT to_regclass('public.organizaciones') IS NOT NULL AS existe
  `);
  if (!resultado[0]?.existe) {
    await db.execute(sql.raw(obtenerEsquemaBase()));
  }
}
