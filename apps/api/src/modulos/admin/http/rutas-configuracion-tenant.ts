import {
  type ConfiguracionBigQuery,
  esquemaConfigurarAutomatizacionBase,
  esquemaConfigurarBigQuery,
  esquemaConfigurarDataflowBase,
  esquemaCredencialesBigQuery,
} from "@qlik/contratos/admin";
import { type Context, Hono } from "hono";
import { ErrorAplicacion } from "../../../nucleo/errores/error-aplicacion.js";
import {
  responderError,
  responderExito,
} from "../../../nucleo/http/respuestas.js";
import type { ServicioQlik } from "../../qlik/publico.js";
import { validarContratoTalend } from "../../reportes/aplicacion/servicio-contexto-talend.js";
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
  resolverQlik: (c: Context) => Promise<ServicioQlik>;
  obtenerBigQuery?: (
    organizacionId: string,
    tenantQlikId: string,
  ) => Promise<ConfiguracionBigQuery>;
  probarBigQuery?: (
    organizacionId: string,
    tenantQlikId: string,
  ) => Promise<{ exitoso: boolean; mensaje: string }>;
  guardarBigQuery?: (entrada: {
    organizacionId: string;
    tenantQlikId: string;
    dataset: string;
    gcsUri?: string;
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
  resolverQlik,
  obtenerBigQuery,
  guardarBigQuery,
  probarBigQuery,
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

      const automatizacion = await resolverQlik(c).then((qlik) =>
        qlik.obtenerAutomatizacion(entrada.automatizacionBaseIdQlik),
      );
      try {
        validarContratoTalend(automatizacion.workspace ?? {});
      } catch (error) {
        throw new ErrorAplicacion(
          "PLANTILLA_INCOMPATIBLE",
          "La automatización seleccionada no cumple el contrato Talend requerido",
          422,
          {
            tipo: "estructura",
            razon: error instanceof Error ? error.message : "Contrato inválido",
          },
        );
      }

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

  const handlerDataflowBase = async (c: Context) => {
    try {
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      exigirAccesoOrganizacion(await resolverContexto(c), organizacionId);
      const entrada = esquemaConfigurarDataflowBase.parse(await c.req.json());
      const resultado = await repositorio.configurarDataflowBase(
        organizacionId,
        tenantQlikId,
        entrada.dataflowBaseIdQlik,
        entrada.dataflowBaseNombre,
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
    "/organizaciones/:id/tenants-qlik/:tenantQlikId/dataflow-base",
    handlerDataflowBase,
  );
  rutas.put(
    "/tenants/:id/qlik/:tenantQlikId/dataflow-base",
    handlerDataflowBase,
  );
  rutas.put(
    "/tenants/:id/qlik/:tenantQlikId/automatizacion-base",
    handlerAutomatizacionBase,
  );

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
          ...(entrada.gcsUri ? { gcsUri: entrada.gcsUri } : {}),
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

  const handlerProbarBigQuery = async (c: Context) => {
    try {
      if (!probarBigQuery) {
        return responderError(c, "Prueba BigQuery no disponible", 503);
      }
      const organizacionId = obtenerParametroRequerido(c, "id");
      const tenantQlikId = obtenerParametroRequerido(c, "tenantQlikId");
      exigirAccesoOrganizacion(await resolverContexto(c), organizacionId);
      return responderExito(
        c,
        await probarBigQuery(organizacionId, tenantQlikId),
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
    rutas.post(`${ruta}/probar`, handlerProbarBigQuery);
  }

  return rutas;
}
