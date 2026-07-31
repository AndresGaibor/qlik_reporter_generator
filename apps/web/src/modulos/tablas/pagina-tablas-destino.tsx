import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useTenantActivo } from "@/compartido/hooks/use-tenant-activo";
import { obtenerConfiguracionBigQuery } from "@/modulos/admin/api";
import {
  obtenerDetalleRecursoDestino,
  obtenerRecursosDestino,
  obtenerVistaPreviaDestino,
} from "@/modulos/reportes/api";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CatalogoResultados } from "./componentes/catalogo-resultados";
import { DetalleResultado } from "./componentes/detalle-resultado";
import { EstadoAccesoResultados } from "./componentes/estado-acceso-resultados";
import { EstadoResultados } from "./componentes/estado-resultados";
import type { PestanaResultado } from "./tipos-resultados";

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

function exigirId(valor: string | undefined | null, nombre: string): string {
  if (!valor) throw new Error(`${nombre} no está disponible`);
  return valor;
}

function EstadoConexion({ estado }: { estado?: string }) {
  const activo = estado === "activo";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        activo ? "bg-brand-50 text-brand-700" : "bg-app text-ink-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-brand-600" : "bg-ink-300"}`}
      />
      {activo ? "Conexión verificada" : "Configuración guardada"}
    </span>
  );
}

function MarcoResultados({
  children,
  proyecto,
  estado,
}: {
  children: ReactNode;
  proyecto?: string;
  estado?: string;
}) {
  const acciones = proyecto ? (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <span
        className="inline-flex max-w-64 items-center gap-1.5 rounded-full bg-obj-50 px-2.5 py-1 font-mono text-xs font-semibold text-obj-600"
        title={proyecto}
      >
        <Icon name="cloud" size="sm" />
        <span className="truncate">{proyecto}</span>
      </span>
      <EstadoConexion estado={estado} />
    </div>
  ) : undefined;

  return (
    <PageLayout>
      <PageHeader
        title="Resultados BigQuery"
        description="Explora las tablas del dataset configurado, revisa sus campos y utiliza una muestra para preparar nuevos reportes."
        actions={acciones}
      />
      {children}
    </PageLayout>
  );
}

export function PaginaTablasDestino() {
  const { tenant, haySesion, sinTenantsDisponibles } = useTenantActivo();
  const [busqueda, setBusqueda] = useState("");
  const [tablaId, setTablaId] = useState<string | null>(null);
  const [pestana, setPestana] = useState<PestanaResultado>("campos");

  const configuracion = useQuery({
    queryKey: ["bigquery-config", tenant?.organizacionId, tenant?.id],
    queryFn: () => {
      if (!tenant) throw new Error("El entorno Qlik no está disponible");
      return obtenerConfiguracionBigQuery(tenant.organizacionId, tenant.id);
    },
    enabled: Boolean(tenant?.organizacionId && tenant?.id),
    retry: false,
    staleTime: 60_000,
  });

  const conexionId = configuracion.data?.id;
  const catalogo = useQuery({
    queryKey: ["bigquery-recursos", conexionId],
    queryFn: () =>
      obtenerRecursosDestino(exigirId(conexionId, "La conexión BigQuery")),
    enabled: Boolean(configuracion.data?.configurada && conexionId),
    retry: false,
    staleTime: 60_000,
  });

  const tablas = useMemo(
    () => (catalogo.data ?? []).filter((recurso) => recurso.tipo === "tabla"),
    [catalogo.data],
  );

  useEffect(() => {
    if (tablas.length === 0) {
      setTablaId(null);
      return;
    }
    if (!tablaId || !tablas.some((tabla) => tabla.id === tablaId)) {
      setTablaId(tablas[0]?.id ?? null);
      setPestana("campos");
    }
  }, [tablaId, tablas]);

  const detalle = useQuery({
    queryKey: ["bigquery-recurso", conexionId, tablaId],
    queryFn: () =>
      obtenerDetalleRecursoDestino(
        exigirId(conexionId, "La conexión BigQuery"),
        exigirId(tablaId, "La tabla"),
      ),
    enabled: Boolean(conexionId && tablaId),
    retry: false,
    staleTime: 60_000,
  });

  const preview = useQuery({
    queryKey: ["bigquery-preview", conexionId, tablaId],
    queryFn: () =>
      obtenerVistaPreviaDestino(
        exigirId(conexionId, "La conexión BigQuery"),
        exigirId(tablaId, "La tabla"),
        15,
      ),
    enabled: Boolean(conexionId && tablaId && pestana === "preview"),
    retry: false,
    staleTime: 30_000,
  });

  if (!haySesion || sinTenantsDisponibles) {
    return (
      <MarcoResultados>
        <EstadoAccesoResultados
          sesion={haySesion}
          sinEntornos={sinTenantsDisponibles}
        />
      </MarcoResultados>
    );
  }

  if (!tenant || configuracion.isLoading) {
    return (
      <MarcoResultados>
        <EstadoCarga mensaje="Cargando configuración de BigQuery…" />
      </MarcoResultados>
    );
  }

  if (configuracion.isError) {
    return (
      <MarcoResultados>
        <EstadoResultados
          tipo="catalogo-error"
          mensaje={mensajeError(configuracion.error)}
          onReintentar={() => configuracion.refetch()}
        />
      </MarcoResultados>
    );
  }

  const bigQuery = configuracion.data;
  if (!bigQuery?.configurada || !bigQuery.id) {
    return (
      <MarcoResultados>
        <EstadoResultados tipo="sin-conexion" />
      </MarcoResultados>
    );
  }

  const proyecto = bigQuery.projectId || "Proyecto no disponible";
  if (bigQuery.estado === "error") {
    return (
      <MarcoResultados proyecto={proyecto} estado={bigQuery.estado}>
        <EstadoResultados
          tipo="conexion-error"
          mensaje={bigQuery.mensajeError ?? undefined}
        />
      </MarcoResultados>
    );
  }

  const dataset = bigQuery.dataset || "Dataset BigQuery";
  return (
    <MarcoResultados proyecto={proyecto} estado={bigQuery.estado}>
      {catalogo.isLoading ? (
        <EstadoCarga mensaje="Consultando tablas de BigQuery…" />
      ) : catalogo.isError ? (
        <EstadoResultados
          tipo="catalogo-error"
          mensaje={mensajeError(catalogo.error)}
          onReintentar={() => catalogo.refetch()}
        />
      ) : tablas.length === 0 ? (
        <EstadoResultados tipo="catalogo-vacio" />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
          <div className="lg:sticky lg:top-24">
            <CatalogoResultados
              recursos={tablas}
              seleccionId={tablaId}
              busqueda={busqueda}
              onBusquedaChange={setBusqueda}
              onSeleccionar={(id) => {
                setTablaId(id);
                setPestana("campos");
              }}
              dataset={dataset}
            />
          </div>

          <main className="min-w-0" aria-live="polite">
            {!tablaId ? (
              <EstadoResultados tipo="sin-seleccion" />
            ) : detalle.isLoading ? (
              <EstadoCarga mensaje="Cargando información de la tabla…" />
            ) : detalle.isError || !detalle.data ? (
              <EstadoResultados
                tipo="catalogo-error"
                mensaje={mensajeError(detalle.error)}
                onReintentar={() => detalle.refetch()}
              />
            ) : (
              <DetalleResultado
                detalle={detalle.data}
                pestana={pestana}
                onPestanaChange={setPestana}
                filasPreview={preview.data ?? []}
                cargandoPreview={preview.isLoading}
                errorPreview={
                  preview.isError ? mensajeError(preview.error) : undefined
                }
                onReintentarPreview={() => preview.refetch()}
              />
            )}
          </main>
        </div>
      )}
    </MarcoResultados>
  );
}
