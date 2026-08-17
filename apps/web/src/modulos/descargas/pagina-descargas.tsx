import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { listarDescargas, type ResumenDescargaEjecucion } from "@/modulos/descargas/api";
import { TarjetaEjecucionDescarga } from "@/modulos/descargas/componentes/tarjeta-ejecucion-descarga";
import { useDescargaEjecucion } from "@/modulos/descargas/use-descarga-ejecucion";
import { esEstadoActivo } from "@/modulos/descargas/presentacion-ejecucion";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export function PaginaDescargas() {
  const { mostrarError } = useNotificaciones();
  const { manejar } = useManejoError(mostrarError);

  const {
    data: descargas = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ResumenDescargaEjecucion[]>({
    queryKey: ["descargas"],
    queryFn: listarDescargas,
    retry: false,
    refetchInterval: (consulta) => {
      const descargasActivas = consulta.state.data?.filter((d) =>
        esEstadoActivo(d.estado as "preparando" | "iniciada"),
      );
      return descargasActivas && descargasActivas.length > 0 ? 2000 : false;
    },
  });

  useEffect(() => {
    if (isError) {
      manejar(error);
    }
  }, [isError, error, manejar]);

  if (isLoading) {
    return <EstadoCarga mensaje="Cargando descargas..." />;
  }

  if (isError) {
    return <EstadoError mensaje={error.message} onReintentar={handleRefetch} />;
  }

  function handleRefetch() {
    refetch();
  }

  return (
    <PageLayout>
      <PageHeader
        title="Descargas"
        description="Historial de reportes generados y listos para descargar."
      />

      {descargas.length === 0 ? (
        <p className="text-sm text-ink-500">No hay descargas disponibles.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {descargas.map((descarga) => (
            <TarjetaConDescarga
              key={descarga.id}
              descarga={descarga}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}

function TarjetaConDescarga({
  descarga,
}: {
  descarga: ResumenDescargaEjecucion;
}) {
  const { estado, iniciarDescarga, cancelar } = useDescargaEjecucion();

  return (
    <TarjetaEjecucionDescarga
      ejecucion={descarga}
      estadoDescarga={estado.estado}
      progreso={estado.progreso}
      totalArchivos={estado.totalArchivos}
      archivoActual={estado.archivoActual}
      error={estado.error}
      onDescargar={() => iniciarDescarga(descarga.id)}
      onCancelar={cancelar}
    />
  );
}
