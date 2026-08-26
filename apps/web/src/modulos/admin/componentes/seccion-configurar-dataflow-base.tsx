import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import {
  type TenantQlik,
  configurarDataflowBaseTenant,
} from "@/modulos/admin/api";
import { obtenerFlujosConFiltros } from "@/modulos/flujos/api";
import type { ResumenFlujo } from "@qlik/contratos/flujos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Props {
  organizacionId: string;
  tenantQlik: TenantQlik;
}

export function SeccionConfigurarDataflowBase({
  organizacionId,
  tenantQlik,
}: Props) {
  const { mostrarExito, mostrarError } = useNotificaciones();
  const queryClient = useQueryClient();
  const iniciales =
    tenantQlik.dataflowPlantillas?.map((item) => item.id) ??
    (tenantQlik.dataflowBaseIdQlik ? [tenantQlik.dataflowBaseIdQlik] : []);
  const [seleccionados, setSeleccionados] = useState<string[]>(iniciales);
  const { data: dataflows = [], isLoading } = useQuery<ResumenFlujo[]>({
    queryKey: ["dataflows-admin-list", tenantQlik.id],
    queryFn: () => obtenerFlujosConFiltros(),
  });
  const guardar = useMutation({
    mutationFn: () =>
      configurarDataflowBaseTenant(
        organizacionId,
        tenantQlik.id,
        seleccionados.map((id) => {
          const dataflow = dataflows.find((item) => item.id === id);
          const anterior = tenantQlik.dataflowPlantillas?.find(
            (item) => item.id === id,
          );
          return {
            id,
            nombre: dataflow?.nombre ?? anterior?.nombre ?? "Dataflow base",
          };
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-tenants-qlik", organizacionId],
      });
      mostrarExito("Plantillas de Dataflow configuradas");
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-line-200 p-3">
        {isLoading ? (
          <p className="text-sm text-ink-500">Cargando Dataflows…</p>
        ) : null}
        {dataflows.map((dataflow) => (
          <label
            key={dataflow.id}
            className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-app"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={seleccionados.includes(dataflow.id)}
              onChange={(evento) =>
                setSeleccionados((actuales) =>
                  evento.target.checked
                    ? [...actuales, dataflow.id]
                    : actuales.filter((id) => id !== dataflow.id),
                )
              }
            />
            <span>
              <span className="block text-sm font-semibold text-ink-900">
                {dataflow.nombre}
              </span>
              <span className="block text-xs text-ink-500">
                {dataflow.espacioNombre || "Personal"}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {seleccionados.length} seleccionada(s)
        </p>
        <Button
          disabled={seleccionados.length === 0 || guardar.isPending}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? "Guardando…" : "Guardar plantillas"}
        </Button>
      </div>
    </div>
  );
}
