import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { SelectBuscable } from "@/compartido/componentes/ui/select-buscable";
import { normalizarError } from "@/compartido/errores/normalizar-error";
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
  const [seleccionado, setSeleccionado] = useState(
    tenantQlik.dataflowBaseIdQlik || "",
  );
  const { data: dataflows = [], isLoading } = useQuery<ResumenFlujo[]>({
    queryKey: ["dataflows-admin-list", tenantQlik.id],
    queryFn: () => obtenerFlujosConFiltros(),
  });
  const guardar = useMutation({
    mutationFn: (dataflow: ResumenFlujo) =>
      configurarDataflowBaseTenant(
        organizacionId,
        tenantQlik.id,
        dataflow.id,
        dataflow.nombre,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-tenants-qlik", organizacionId],
      });
      mostrarExito("Dataflow base configurado");
    },
    onError: (error: Error) => mostrarError(normalizarError(error).mensaje),
  });

  const opcionesBase = dataflows.map((dataflow) => ({
    id: dataflow.id,
    nombre: `${dataflow.nombre} (ID: ${dataflow.id.slice(0, 8)}…)`,
    espacioNombre: dataflow.espacioNombre || "Personal",
  }));
  const existeActual = opcionesBase.some(
    (opcion) => opcion.id === tenantQlik.dataflowBaseIdQlik,
  );
  const opciones =
    tenantQlik.dataflowBaseIdQlik && !existeActual
      ? [
          {
            id: tenantQlik.dataflowBaseIdQlik,
            nombre: `${tenantQlik.dataflowBaseNombre || "Dataflow base"} (ID: ${tenantQlik.dataflowBaseIdQlik.slice(0, 8)}…)`,
            espacioNombre: "Plantilla activa actual",
          },
          ...opcionesBase,
        ]
      : opcionesBase;

  const seleccionar = (id: string) => {
    const dataflow = dataflows.find((item) => item.id === id) ?? {
      id,
      nombre: tenantQlik.dataflowBaseNombre || "Dataflow base",
      espacioNombre: "",
    };
    setSeleccionado(id);
    guardar.mutate(dataflow);
  };

  return (
    <SelectBuscable
      placeholder="Busca y selecciona el Dataflow plantilla…"
      searchPlaceholder="Escribe el nombre para filtrar…"
      emptyText="No encontramos Dataflows disponibles para usar como plantilla."
      opciones={opciones}
      valorSeleccionado={seleccionado}
      onSeleccionar={seleccionar}
      cargando={isLoading || guardar.isPending}
    />
  );
}
