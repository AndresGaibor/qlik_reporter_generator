import { clienteApi } from "@/compartido/api/cliente";
import type {
  ManifiestoDescarga,
  ResumenDescargaEjecucion,
} from "@qlik/contratos/descargas";

export type { ResumenDescargaEjecucion };
export type { ManifiestoDescarga };

export function listarDescargas(): Promise<ResumenDescargaEjecucion[]> {
  return clienteApi.get<ResumenDescargaEjecucion[]>("/descargas");
}

export function solicitarManifiesto(id: string): Promise<ManifiestoDescarga> {
  return clienteApi.post<ManifiestoDescarga>(
    `/descargas/${encodeURIComponent(id)}/manifiesto`,
  );
}
