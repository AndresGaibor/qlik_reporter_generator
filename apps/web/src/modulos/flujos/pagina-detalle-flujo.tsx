import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { Button } from "@/compartido/componentes/ui/button";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { construirUrlVerFlujoQlik } from "@/compartido/utiles/qlik-urls";
import {
  type ResumenFlujo,
  obtenerFlujosConFiltros,
  obtenerResumenReporteDataflow,
} from "@/modulos/flujos/api";
import {
  type ResumenAutomatizacion,
  obtenerAutomatizaciones,
} from "@/modulos/reportes/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { PestanaAutomatizacionFlujo } from "./componentes/detalle/pestana-automatizacion-flujo";
import { PestanaMetadataFlujo } from "./componentes/detalle/pestana-metadata-flujo";
import { PestanaScriptFlujo } from "./componentes/detalle/pestana-script-flujo";

export function PaginaDetalleFlujo() {
  const { id } = useParams({ strict: false }) as { id: string };
  const [pestana, setPestana] = useState<
    "diseno" | "metadata" | "automatizaciones"
  >("diseno");

  const { tenant: tenantActivo } = useTenantActivo();

  const {
    data: flujos = [],
    isLoading: cargandoFlujos,
    isError: errorFlujos,
    error: errorFlujosMsg,
  } = useQuery<ResumenFlujo[]>({
    queryKey: ["flujos"],
    queryFn: () => obtenerFlujosConFiltros(),
    retry: false,
    staleTime: 60 * 1000,
  });

  const {
    data: resumenReporte,
    isLoading: cargandoResumen,
    isFetching: actualizandoResumen,
    error: errorResumen,
    refetch: actualizarResumen,
  } = useQuery({
    queryKey: ["resumen-reporte-dataflow", id],
    queryFn: () => obtenerResumenReporteDataflow(id),
    retry: false,
    staleTime: 60 * 1000,
  });

  const { data: automatizaciones = [] } = useQuery<ResumenAutomatizacion[]>({
    queryKey: ["automatizaciones"],
    queryFn: () => obtenerAutomatizaciones(),
    staleTime: 60 * 1000,
  });

  const flujo = flujos.find((f) => f.id === id);
  const automatizacionVinculada = automatizaciones.find(
    (auto) =>
      auto.nombre.includes(id) ||
      (flujo && auto.nombre.toLowerCase().includes(flujo.nombre.toLowerCase())),
  );

  const targetHost = tenantActivo?.host;
  const urlQlikCloud =
    targetHost && flujo
      ? construirUrlVerFlujoQlik(targetHost, flujo.id, flujo.espacioId || "")
      : null;

  if (cargandoFlujos) {
    return <EstadoCarga mensaje="Cargando información del flujo de datos..." />;
  }

  if (errorFlujos || !flujo) {
    return (
      <EstadoError
        mensaje={
          errorFlujosMsg instanceof Error
            ? errorFlujosMsg.message
            : !flujo
              ? `No se encontró el flujo de datos con ID "${id}".`
              : "Error al recuperar información del flujo."
        }
      />
    );
  }

  return (
    <PageLayout>
      <div>
        <Link
          to="/flujos"
          className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 transition-colors font-medium mb-4"
        >
          <Icon name="chev" size="sm" className="rotate-180" />
          Volver a Dataflows de Qlik
        </Link>
      </div>

      <PageHeader
        title={flujo.nombre}
        description={`Dataflow de Qlik · Espacio ${flujo.espacioNombre || "Personal"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {urlQlikCloud && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
              >
                <a
                  href={urlQlikCloud}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="ext" size="sm" />
                  Ver en Qlik Cloud
                </a>
              </Button>
            )}

            {automatizacionVinculada ? (
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <Link
                  to="/reportes/$id"
                  params={{ id: automatizacionVinculada.id }}
                >
                  <Icon name="zap" size="sm" />
                  Ver automatización ya creada
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                size="sm"
                className="bg-brand-600 hover:bg-brand-700 text-white gap-1.5"
              >
                <Link to="/reportes">
                  <Icon name="zap" size="sm" />
                  Crear automatización en Qlik Automate
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="flex rounded-xl bg-line-200/60 p-1 text-sm max-w-fit shadow-xs">
        <button
          type="button"
          onClick={() => setPestana("diseno")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            pestana === "diseno"
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900"
          }`}
        >
          Diseño y validación
        </button>
        <button
          type="button"
          onClick={() => setPestana("metadata")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            pestana === "metadata"
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900"
          }`}
        >
          Detalles del Dataflow
        </button>
        <button
          type="button"
          onClick={() => setPestana("automatizaciones")}
          className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            pestana === "automatizaciones"
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900"
          }`}
        >
          <span>Automatización en Qlik Automate</span>
          {automatizacionVinculada && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>

      <div className="space-y-6">
        {pestana === "diseno" && (
          <PestanaScriptFlujo
            resumen={resumenReporte}
            cargando={cargandoResumen}
            actualizando={actualizandoResumen}
            error={errorResumen}
            onActualizar={() => void actualizarResumen()}
          />
        )}

        {pestana === "metadata" && <PestanaMetadataFlujo flujo={flujo} />}

        {pestana === "automatizaciones" && (
          <PestanaAutomatizacionFlujo
            flujo={flujo}
            automatizacionVinculada={automatizacionVinculada}
          />
        )}
      </div>
    </PageLayout>
  );
}
