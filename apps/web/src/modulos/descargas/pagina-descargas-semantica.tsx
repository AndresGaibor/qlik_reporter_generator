import { useContextoVista } from "@/app/contexto-vista";
import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listarDescargas } from "./api";
import { ArchivosEjecucion } from "./componentes/archivos-ejecucion";
import { ListaEjecucionesDescarga } from "./componentes/lista-ejecuciones-descarga";
import { ListaReportesDescarga } from "./componentes/lista-reportes-descarga";
import { TarjetaEjecucionDescarga } from "./componentes/tarjeta-ejecucion-descarga";
import {
  type ReporteDescarga,
  agruparEjecucionesPorReporte,
} from "./modelo-presentacion";
import { esEstadoActivo, formatearFechaISO } from "./presentacion-ejecucion";
import { useDescargaEjecucion } from "./use-descarga-ejecucion";

function useSeleccion() {
  const leer = useCallback(() => {
    if (typeof window === "undefined") return { reporte: "", ejecucion: "" };
    const params = new URLSearchParams(window.location.search);
    return {
      reporte: params.get("reporte") ?? "",
      ejecucion: params.get("ejecucion") ?? "",
    };
  }, []);
  const [seleccion, setSeleccion] = useState(leer);
  useEffect(() => {
    const sincronizar = () => setSeleccion(leer());
    window.addEventListener("popstate", sincronizar);
    return () => window.removeEventListener("popstate", sincronizar);
  }, [leer]);
  const navegar = useCallback((reporte: string, ejecucion?: string) => {
    const url = new URL(window.location.href);
    for (const key of ["carpeta", "almacenamiento"])
      url.searchParams.delete(key);
    if (reporte) url.searchParams.set("reporte", reporte);
    else url.searchParams.delete("reporte");
    if (ejecucion) url.searchParams.set("ejecucion", ejecucion);
    else url.searchParams.delete("ejecucion");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSeleccion({ reporte, ejecucion: ejecucion ?? "" });
  }, []);
  return { seleccion, navegar };
}

export function PaginaDescargasSemantica() {
  const { esAdmin, modoUsuarioFinal } = useContextoVista();
  const { seleccion, navegar } = useSeleccion();
  const consulta = useQuery({
    queryKey: ["descargas"],
    queryFn: listarDescargas,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((item) => esEstadoActivo(item.estado as never))
        ? 5000
        : false,
  });
  const reportes = useMemo(
    () => agruparEjecucionesPorReporte(consulta.data ?? []),
    [consulta.data],
  );
  const reporte = reportes.find(
    (item) => item.flujoIdQlik === seleccion.reporte,
  );
  const ejecucion = reporte?.ejecuciones.find(
    (item) => item.id === seleccion.ejecucion,
  );

  return (
    <PageLayout>
      <PageHeader
        title="Descargas de reportes"
        description="Consulta los resultados de tus ejecuciones y descarga los archivos generados."
      />
      <div
        className="flex items-start gap-2 rounded-lg border border-success-100 bg-success-50/60 px-4 py-3 text-sm text-success-800"
        role="note"
      >
        <Icon name="shield" size="sm" />
        <span>
          <strong>Tus descargas son privadas.</strong> Solo tú y los
          administradores autorizados pueden acceder a estos resultados.
        </span>
      </div>
      {esAdmin && !modoUsuarioFinal && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = "/descargas/administracion";
            }}
          >
            Administrar descargas <Icon name="users" size="sm" />
          </Button>
        </div>
      )}
      {consulta.isLoading && <EstadoCarga />}
      {consulta.isError && (
        <EstadoError onRetry={() => void consulta.refetch()} />
      )}
      {!consulta.isLoading && !consulta.isError && !seleccion.reporte && (
        <Raiz
          reportes={reportes}
          onAbrir={(item) => navegar(item.flujoIdQlik)}
        />
      )}
      {!consulta.isLoading &&
        !consulta.isError &&
        reporte &&
        !seleccion.ejecucion && (
          <section>
            <Breadcrumb onRoot={() => navegar("")} reporte={reporte.nombre} />
            <h2 className="mt-5 font-display text-xl font-semibold text-ink-900">
              Ejecuciones
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Consulta los resultados generados cada vez que se ejecutó este
              reporte.
            </p>
            <div className="mt-4">
              <ListaEjecucionesDescarga
                ejecuciones={reporte.ejecuciones}
                onAbrir={(item) => navegar(reporte.flujoIdQlik, item.id)}
              />
            </div>
          </section>
        )}
      {!consulta.isLoading && !consulta.isError && reporte && ejecucion && (
        <Detalle
          ejecucion={ejecucion}
          reporte={reporte}
          onRoot={() => navegar("")}
          onReporte={() => navegar(reporte.flujoIdQlik)}
        />
      )}
      {seleccion.reporte && !reporte && !consulta.isLoading && (
        <EstadoVacio
          titulo="Resultado no disponible"
          texto="No encontramos el reporte solicitado."
        />
      )}
    </PageLayout>
  );
}

function Raiz({
  reportes,
  onAbrir,
}: {
  reportes: ReporteDescarga[];
  onAbrir: (reporte: ReporteDescarga) => void;
}) {
  return (
    <section aria-labelledby="mis-reportes">
      <h2
        id="mis-reportes"
        className="font-display text-xl font-semibold text-ink-900"
      >
        Mis reportes con resultados
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-500">
        Selecciona un reporte para consultar sus ejecuciones.
      </p>
      {reportes.length ? (
        <ListaReportesDescarga reportes={reportes} onAbrir={onAbrir} />
      ) : (
        <EstadoVacio
          titulo="Aún no tienes archivos para descargar"
          texto="Cuando ejecutes un reporte, sus resultados aparecerán aquí."
        />
      )}
    </section>
  );
}

function Detalle({
  ejecucion,
  reporte,
  onRoot,
  onReporte,
}: {
  ejecucion: ResumenDescargaEjecucion;
  reporte: ReporteDescarga;
  onRoot: () => void;
  onReporte: () => void;
}) {
  const descarga = useDescargaEjecucion();
  return (
    <section>
      <Breadcrumb
        onRoot={onRoot}
        onReporte={onReporte}
        reporte={reporte.nombre}
        ejecucion={formatearFechaISO(ejecucion.creadoEn)}
      />
      <div className="mb-4 mt-5">
        <h2 className="font-display text-xl font-semibold text-ink-900">
          Archivos generados
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Descarga uno o todos los archivos de esta ejecución.
        </p>
      </div>
      {ejecucion.archivos.length ? (
        <>
          <TarjetaEjecucionDescarga
            ejecucion={ejecucion}
            estadoDescarga={descarga.estado.estado}
            progreso={descarga.estado.progreso}
            porcentaje={descarga.estado.porcentaje}
            bytesDescargados={descarga.estado.bytesDescargados}
            totalBytes={descarga.estado.totalBytes}
            totalArchivos={descarga.estado.totalArchivos}
            archivoActual={descarga.estado.archivoActual}
            error={descarga.estado.error}
            onDescargar={() => void descarga.iniciarDescarga(ejecucion.id)}
            onDescargarArchivo={() => undefined}
            onCancelar={descarga.cancelar}
          />
          <div className="mt-4">
            <ArchivosEjecucion
              archivos={ejecucion.archivos}
              onDescargar={(nombre) =>
                void descarga.iniciarDescarga(ejecucion.id, nombre)
              }
            />
          </div>
        </>
      ) : (
        <EstadoVacio
          titulo="La ejecución terminó, pero no hay archivos disponibles"
          texto="Revisa el historial de la ejecución para obtener más información."
        />
      )}
    </section>
  );
}

function Breadcrumb({
  onRoot,
  onReporte,
  reporte,
  ejecucion,
}: {
  onRoot: () => void;
  onReporte?: () => void;
  reporte?: string;
  ejecucion?: string;
}) {
  return (
    <nav
      aria-label="Ruta actual"
      className="flex flex-wrap items-center gap-1 text-sm text-ink-500"
    >
      <button
        type="button"
        onClick={onRoot}
        className="rounded px-1 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Descargas
      </button>
      {reporte && (
        <>
          <span>/</span>
          <button
            type="button"
            onClick={onReporte ?? (() => undefined)}
            className="rounded px-1 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-current={!ejecucion ? "page" : undefined}
          >
            {reporte}
          </button>
        </>
      )}
      {ejecucion && (
        <>
          <span>/</span>
          <span aria-current="page" className="text-ink-800">
            {ejecucion}
          </span>
        </>
      )}
    </nav>
  );
}
function EstadoCarga() {
  return (
    <output className="grid gap-3" aria-live="polite">
      <span className="sr-only">Cargando descargas…</span>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-24 animate-pulse rounded-xl bg-surface-subtle"
        />
      ))}
    </output>
  );
}
function EstadoError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-xl border border-danger-100 bg-danger-50 p-5"
      role="alert"
    >
      <h2 className="font-semibold text-danger-800">
        No pudimos consultar tus descargas
      </h2>
      <p className="mt-1 text-sm text-danger-700">
        Inténtalo nuevamente. Si el problema continúa, contacta al
        administrador.
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
function EstadoVacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-300 bg-surface-subtle p-8 text-center">
      <Icon name="download" size="lg" className="mx-auto text-ink-400" />
      <h3 className="mt-3 font-semibold text-ink-800">{titulo}</h3>
      <p className="mt-1 text-sm text-ink-500">{texto}</p>
    </div>
  );
}
