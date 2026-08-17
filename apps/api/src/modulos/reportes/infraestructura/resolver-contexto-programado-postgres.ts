import { and, eq } from "drizzle-orm";
import type { ConexionDb } from "../../../plataforma/persistencia/conexion.js";
import {
  conexionesDestino,
  credencialesQlik,
  identidadesQlik,
  tenantsQlik,
} from "../../../plataforma/persistencia/esquema.js";
import type { PuertoOAuthQlik } from "../../autenticacion-qlik/aplicacion/puertos/puerto-oauth-qlik.js";
import type { ServicioCifradoPuerto } from "../../autenticacion-qlik/aplicacion/puertos/repositorio-autenticacion.js";
import { ClienteOAuthQlik } from "../../autenticacion-qlik/infraestructura/cliente-oauth-qlik.js";
import type { PuertoQlik } from "../../qlik/aplicacion/puertos/puerto-qlik.js";
import { ClienteHttpQlik } from "../../qlik/infraestructura/cliente-http-qlik.js";
import type { ContextoEjecucionProgramada } from "../aplicacion/programador-reportes.js";

interface ConfiguracionOAuthProgramada {
  clienteId: string;
  clienteSecreto: string;
  scopes: string[];
}

interface ProveedorConfiguracionOAuth {
  obtenerParaTenant(
    tenantQlikId: string,
  ): Promise<ConfiguracionOAuthProgramada>;
}

type CrearOAuth = (entrada: {
  clienteId: string;
  clienteSecreto: string;
  host: string;
  scopes: string[];
  redirectUri: string;
}) => Pick<PuertoOAuthQlik, "refrescarToken">;

type CrearQlik = (host: string, tokenAcceso: string) => PuertoQlik;

export class ResolverContextoProgramadoPostgres {
  constructor(
    private readonly db: ConexionDb,
    private readonly cifrado: ServicioCifradoPuerto,
    private readonly configuracionOAuth: ProveedorConfiguracionOAuth,
    private readonly redirectUri: string,
    private readonly crearOAuth: CrearOAuth = (entrada) =>
      new ClienteOAuthQlik(
        entrada.clienteId,
        entrada.clienteSecreto,
        entrada.redirectUri,
        entrada.host,
        entrada.scopes.join(" "),
      ),
    private readonly crearQlik: CrearQlik = (host, token) =>
      new ClienteHttpQlik(host, token),
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async resolver(entrada: {
    tenantQlikId: string;
    organizacionId: string;
    usuarioId: string;
  }): Promise<ContextoEjecucionProgramada> {
    const tenant = await this.db.query.tenantsQlik.findFirst({
      where: and(
        eq(tenantsQlik.id, entrada.tenantQlikId),
        eq(tenantsQlik.organizacionId, entrada.organizacionId),
      ),
    });
    if (!tenant || tenant.estado !== "activo") {
      throw new Error("El tenant Qlik del reporte no está activo");
    }

    const identidad = await this.db.query.identidadesQlik.findFirst({
      where: and(
        eq(identidadesQlik.usuarioId, entrada.usuarioId),
        eq(identidadesQlik.tenantQlikId, entrada.tenantQlikId),
      ),
    });
    if (!identidad) {
      throw new Error(
        "El creador del reporte ya no tiene identidad Qlik en este tenant",
      );
    }

    const credencial = await this.db.query.credencialesQlik.findFirst({
      where: eq(credencialesQlik.identidadQlikId, identidad.id),
    });
    if (!credencial || credencial.estado !== "activa") {
      throw new Error(
        "El creador del reporte debe reconectar su cuenta Qlik antes de ejecutar programaciones",
      );
    }

    const instante = this.ahora();
    let tokenAcceso = descifrarToken(
      credencial.tokenAccesoCifrado,
      this.cifrado,
    );
    const margen = new Date(instante.getTime() + 60_000);
    if (credencial.tokenExpiraEn <= margen) {
      const tokenRefresco = credencial.tokenRefrescoCifrado
        ? descifrarToken(credencial.tokenRefrescoCifrado, this.cifrado)
        : undefined;
      if (!tokenRefresco) {
        throw new Error(
          "Las credenciales Qlik expiraron y no existe refresh token; se requiere reconexión",
        );
      }
      const config = await this.configuracionOAuth.obtenerParaTenant(
        entrada.tenantQlikId,
      );
      const oauth = this.crearOAuth({
        clienteId: config.clienteId,
        clienteSecreto: config.clienteSecreto,
        host: tenant.host,
        scopes: config.scopes,
        redirectUri: this.redirectUri,
      });
      const tokens = await oauth.refrescarToken(tokenRefresco);
      tokenAcceso = tokens.tokenAcceso;
      const refreshFinal = tokens.tokenRefresco ?? tokenRefresco;
      await this.db
        .update(credencialesQlik)
        .set({
          tokenAccesoCifrado: cifrarToken(tokenAcceso, this.cifrado),
          tokenRefrescoCifrado: cifrarToken(refreshFinal, this.cifrado),
          tokenExpiraEn: new Date(
            instante.getTime() + tokens.expiraEnSegundos * 1000,
          ),
          scopes: tokens.scopes,
          estado: "activa",
          version: credencial.version + 1,
          actualizadoEn: instante,
        })
        .where(eq(credencialesQlik.id, credencial.id));
    }

    const bigQuery = await this.db.query.conexionesDestino.findFirst({
      where: and(
        eq(conexionesDestino.organizacionId, entrada.organizacionId),
        eq(conexionesDestino.tipo, "bigquery"),
        eq(conexionesDestino.esPredeterminada, true),
      ),
      orderBy: (tabla, operadores) => [operadores.desc(tabla.actualizadoEn)],
    });
    if (!bigQuery) {
      throw new Error(
        "La organización no tiene una conexión BigQuery predeterminada",
      );
    }
    const config = bigQuery.config as Record<string, unknown>;
    const projectId =
      typeof config.projectId === "string" ? config.projectId.trim() : "";
    const dataset =
      typeof config.dataset === "string" ? config.dataset.trim() : "";
    if (!projectId || !dataset) {
      throw new Error(
        "La conexión BigQuery predeterminada requiere projectId y dataset",
      );
    }

    return {
      qlik: this.crearQlik(tenant.host, tokenAcceso),
      alcanceBigQuery: { projectId, dataset },
    };
  }
}

function descifrarToken(valor: string, cifrado: ServicioCifradoPuerto): string {
  const paquete = JSON.parse(valor) as Record<string, unknown>;
  if (
    typeof paquete.cifrado !== "string" ||
    typeof paquete.iv !== "string" ||
    typeof paquete.tag !== "string"
  ) {
    throw new Error("El paquete cifrado de credenciales Qlik es inválido");
  }
  return cifrado.descifrar(paquete.cifrado, paquete.iv, paquete.tag);
}

function cifrarToken(valor: string, cifrado: ServicioCifradoPuerto): string {
  return JSON.stringify(cifrado.cifrar(valor));
}
