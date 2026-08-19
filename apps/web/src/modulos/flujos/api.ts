import { clienteApi } from "@/compartido/api/cliente";
import type { EspacioDisponible } from "@qlik/contratos/automatizaciones";
import type {
  DataflowBaseDisponible,
  ResultadoClonarDataflowBase,
  ResumenFlujo,
  ResumenReporteDataflow,
} from "@qlik/contratos/flujos";

export type { ResumenFlujo };
export function obtenerFlujos() {
  return clienteApi.get<ResumenFlujo[]>("/flujos");
}

export function obtenerFlujosConFiltros(espacioId?: string, busqueda?: string) {
  return clienteApi.get<ResumenFlujo[]>("/flujos", {
    parametros: {
      ...(espacioId ? { espacioId } : {}),
      ...(busqueda ? { q: busqueda } : {}),
    },
  });
}

export function obtenerDataflowBase() {
  return clienteApi.get<DataflowBaseDisponible>("/flujos/plantilla-base");
}

export function clonarDataflowBase(nombre: string) {
  return clienteApi.post<ResultadoClonarDataflowBase>(
    "/flujos/desde-plantilla",
    { nombre },
  );
}

export function obtenerEspacios() {
  return clienteApi.get<EspacioDisponible[]>("/qlik/automatizaciones/espacios");
}

export interface RespuestaScriptFlujo {
  id: string;
  script: string;
  versionMessage?: string | null;
}

export function obtenerScriptFlujo(id: string) {
  return clienteApi.get<RespuestaScriptFlujo>(
    `/flujos/${encodeURIComponent(id)}/script`,
  );
}

export function obtenerResumenReporteDataflow(id: string) {
  return clienteApi.get<ResumenReporteDataflow>(
    `/flujos/${encodeURIComponent(id)}/resumen`,
  );
}
