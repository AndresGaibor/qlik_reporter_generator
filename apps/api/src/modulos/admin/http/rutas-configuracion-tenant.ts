import {
  type ConfiguracionBigQuery,
  esquemaConfigurarAutomatizacionBase,
  esquemaConfigurarBigQuery,
  esquemaConfigurarConexionDestino,
  esquemaConfigurarDestinoTenant,
  esquemaCredencialesBigQuery,
} from "@qlik/contratos/admin";
import { type Context, Hono } from "hono";
import {
  responderError,
  responderExito,
} from "../../../nucleo/http/respuestas.js";
import type { RepositorioAdministracion } from "../aplicacion/puertos/repositorio-administracion.js";
import type { ResolverContextoAdmin } from "./rutas-comunes.js";
import {
  exigirAccesoOrganizacion,
  obtenerParametroRequerido,
  responderErrorAdmin,
} from "./rutas-comunes.js";

export interface DependenciasRutasConfiguracionTenant {
  repositorio: RepositorioAdministracion;
  resolverContexto: ResolverContextoAdmin;
  guardarConexionDestino?: (entrada: {
    organizacionId: string;
    tenantQlikId: string;
    tipo: string;
    nombre: string;
    config: Record<string, unknown>;
    esPredeterminada?: boolean;
    secretoRefs?: Record<string, unknown>;
  }) => Promise<{ id: string }>;
  obtenerBigQuery?: (
    organizacionId: string,
    tenantQlikId: string,
  ) => Promise<ConfiguracionBigQuery>;
  guardarBigQuery?: (entrada: {
    organizacionId: string;
    tenantQlikId: string;
    dataset: string;
    credencialesJson?: string;
    projectId?: string;
    clientEmail?: string;
    limiteMiB?: number;
    limiteUsd?: number;
    precioUsdPorTib: number;
  }) => Promise<ConfiguracionBigQuery>;
}

export function crearRutasConfiguracionTenant({
  repositorio,
  resolverContexto,
  guardarConexionDestino,
  obtenerBigQuery,
  guardarBigQuery,
}: DependenciasRutasConfiguracionTenant) {
  const rutas = new Hono();

  const handlerAutomatizacionBase = async (c: Context) => {
    try {
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      const contexto = await resolverContexto(c);
      exigirAccesoOrganizacion(contexto, organizacionId);

      const cuerpo = await c.req.json();
      const entrada = esquemaConfigurarAutomatizacionBase.parse(cuerpo);

      const resultado = await repositorio.configurarAutomatizacionBase(
        organizacionId,
        tenantQlikId,
        entrada.automatizacionBaseIdQlik,
        entrada.automatizacionBaseNombre,
      );

      if (!resultado) {
        return responderError(c, "Tenant Qlik no encontrado", 404, {
          codigo: "NO_ENCONTRADO",
        });
      }

      return responderExito(c, resultado);
    } catch (error) {
      return responderErrorAdmin(c, error);
    }
  };

  rutas.put(
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/automatizacion-base",
    handlerAutomatizacionBase,
  );
  rutas.put(
    "/tenants/:id/qlik/:tenantQlikId/automatizacion-base",
    handlerAutomatizacionBase,
  );

  const handlerDestino = async (c: Context) => {
    try {
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      const contexto = await resolverContexto(c);
      exigirAccesoOrganizacion(contexto, organizacionId);

      const cuerpo = await c.req.json();
      const entrada = esquemaConfigurarDestinoTenant.parse(cuerpo);

      const resultado = await repositorio.configurarDestinoTenant(
        organizacionId,
        tenantQlikId,
        entrada.destinoApiUrl,
        entrada.destinoApiKey,
        entrada.destinoBaseDatos,
      );

      if (!resultado) {
        return responderError(c, "Tenant Qlik no encontrado", 404, {
          codigo: "NO_ENCONTRADO",
        });
      }

      return responderExito(c, resultado);
    } catch (error) {
      return responderErrorAdmin(c, error);
    }
  };

  rutas.put(
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/destino",
    handlerDestino,
  );
  rutas.put("/tenants/:id/qlik/:tenantQlikId/destino", handlerDestino);

  const handlerObtenerBigQuery = async (c: Context) => {
    try {
      if (!obtenerBigQuery) {
        return responderError(c, "Configuración BigQuery no disponible", 503);
      }
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      const contexto = await resolverContexto(c);
      exigirAccesoOrganizacion(contexto, organizacionId);
      return responderExito(
        c,
        await obtenerBigQuery(organizacionId, tenantQlikId),
      );
    } catch (error) {
      return responderErrorAdmin(c, error);
    }
  };

  const handlerGuardarBigQuery = async (c: Context) => {
    try {
      if (!guardarBigQuery || !obtenerBigQuery) {
        return responderError(c, "Configuración BigQuery no disponible", 503);
      }
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      const contexto = await resolverContexto(c);
      exigirAccesoOrganizacion(contexto, organizacionId);
      const entrada = esquemaConfigurarBigQuery.parse(await c.req.json());
      let projectId: string | undefined;
      let clientEmail: string | undefined;

      if (entrada.credencialesJson) {
        let json: unknown;
        try {
          json = JSON.parse(entrada.credencialesJson);
        } catch {
          return responderError(
            c,
            "El JSON de la cuenta de servicio no es válido",
            400,
            {
              codigo: "JSON_BIGQUERY_INVALIDO",
            },
          );
        }
        const credenciales = esquemaCredencialesBigQuery.parse(json);
        projectId = credenciales.project_id;
        clientEmail = credenciales.client_email;
      } else {
        const actual = await obtenerBigQuery(organizacionId, tenantQlikId);
        if (!actual.credencialesConfiguradas) {
          return responderError(
            c,
            "La primera configuración de BigQuery requiere el JSON de la cuenta de servicio",
            400,
            { codigo: "CREDENCIALES_BIGQUERY_REQUERIDAS" },
          );
        }
        projectId = actual.projectId;
        clientEmail = actual.clientEmail;
      }

      return responderExito(
        c,
        await guardarBigQuery({
          organizacionId,
          tenantQlikId,
          dataset: entrada.dataset,
          ...(entrada.credencialesJson
            ? { credencialesJson: entrada.credencialesJson }
            : {}),
          ...(projectId ? { projectId } : {}),
          ...(clientEmail ? { clientEmail } : {}),
          ...(entrada.limiteMiB ? { limiteMiB: entrada.limiteMiB } : {}),
          ...(entrada.limiteUsd ? { limiteUsd: entrada.limiteUsd } : {}),
          precioUsdPorTib: entrada.precioUsdPorTib,
        }),
      );
    } catch (error) {
      return responderErrorAdmin(c, error);
    }
  };

  for (const ruta of [
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/bigquery",
    "/tenants/:id/qlik/:tenantQlikId/bigquery",
  ]) {
    rutas.get(ruta, handlerObtenerBigQuery);
    rutas.put(ruta, handlerGuardarBigQuery);
  }

  rutas.put(
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/destino-generico",
    async (c) => {
      try {
        if (!guardarConexionDestino) {
          return responderError(
            c,
            "Configuración de destinos no disponible",
            503,
          );
        }
        const organizacionId = obtenerParametroRequerido(c, "id");
        const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
        const contexto = await resolverContexto(c);
        exigirAccesoOrganizacion(contexto, organizacionId);
        const entrada = esquemaConfigurarConexionDestino.parse(
          await c.req.json(),
        );
        return responderExito(
          c,
          await guardarConexionDestino({
            organizacionId,
            tenantQlikId,
            ...entrada,
          }),
        );
      } catch (error) {
        return responderErrorAdmin(c, error);
      }
    },
  );

  return rutas;
}
