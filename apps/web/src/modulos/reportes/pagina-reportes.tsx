import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { ejecutarReporte, obtenerReportes } from "@/modulos/reportes/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListaReportes } from "./componentes/lista-reportes";

export function PaginaReportes() {
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const [idEjecutando, setIdEjecutando] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ["reportes"],
    queryFn: () => obtenerReportes(),
    retry: false,
  });
  const ejecutar = useMutation({
    mutationFn: ejecutarReporte,
    onMutate: setIdEjecutando,
    onSuccess: async () => {
      mostrarExito("Ejecución del reporte iniciada");
      await queryClient.invalidateQueries({ queryKey: ["reportes"] });
    },
    onError: (error: Error) => mostrarError(error.message),
    onSettled: () => setIdEjecutando(null),
  });
  if (consulta.isLoading) return <EstadoCarga mensaje="Cargando reportes..." />;
  if (consulta.isError)
    return (
      <EstadoError
        mensaje={consulta.error.message}
        onReintentar={() => void consulta.refetch()}
      />
    );
  return (
    <PageLayout>
      <div className="space-y-4">
        <header>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Reportes
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Reportes disponibles para tu usuario.
          </p>
        </header>
        <ListaReportes
          reportes={consulta.data ?? []}
          idEjecutando={idEjecutando}
          onEjecutar={(id) => ejecutar.mutate(id)}
          hayFiltros={false}
        />
      </div>
    </PageLayout>
  );
}
