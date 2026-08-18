import { useContextoVista } from "@/app/contexto-vista";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import {
  type ResumenDescargaEjecucion,
  firmarArchivoExploradorGcs,
  listarDescargas,
  listarDescargasAdministracion,
  listarExploradorGcs,
} from "@/modulos/descargas/api";
import { TarjetaEjecucionDescarga } from "@/modulos/descargas/componentes/tarjeta-ejecucion-descarga";
import {
  esEstadoActivo,
  formatearFechaISO,
  formatearTamano,
} from "@/modulos/descargas/presentacion-ejecucion";
import { useDescargaEjecucion } from "@/modulos/descargas/use-descarga-ejecucion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function PaginaDescargas() {
  const { mostrarError } = useNotificaciones();
  const { manejar } = useManejoError(mostrarError);
  const { esAdmin, modoUsuarioFinal } = useContextoVista();
  const puedeAdministrar = esAdmin && !modoUsuarioFinal;
  const [rutaGcs, setRutaGcs] = useState("");

  const explorador = useQuery({
    queryKey: ["explorador-gcs", rutaGcs],
    queryFn: () => listarExploradorGcs(rutaGcs),
    retry: false,
    enabled: puedeAdministrar,
  });

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

  const administracion = useQuery<ResumenDescargaEjecucion[]>({
    queryKey: ["descargas-administracion"],
    queryFn: listarDescargasAdministracion,
    retry: false,
    enabled: puedeAdministrar,
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
        description="Consulta tus reportes generados desde una carpeta privada y descarga sus archivos cuando estén listos."
      />

      <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-surface-subtle p-2 text-brand-700">
            <Icon name="folder" />
          </div>
          <div>
            <h2 className="font-semibold text-ink-900">Mi carpeta</h2>
            <p className="mt-1 text-sm text-ink-500">
              Solo tu cuenta puede acceder a estas ejecuciones y sus archivos.
            </p>
          </div>
        </div>
      </section>

      <h2 className="mt-6 text-base font-semibold text-ink-900">
        Mis reportes
      </h2>
      {descargas.length === 0 ? (
        <p className="text-sm text-ink-500">No hay descargas disponibles.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {descargas.map((descarga) => (
            <TarjetaConDescarga key={descarga.id} descarga={descarga} />
          ))}
        </div>
      )}

      {puedeAdministrar && (
        <>
          <SeccionAdministracion descargas={administracion.data ?? []} />
          <SeccionExploradorGcs
            datos={explorador.data ?? null}
            cargando={explorador.isLoading}
            error={
              explorador.error instanceof Error ? explorador.error.message : null
            }
            onAbrirCarpeta={(carpeta) => setRutaGcs(`${rutaGcs}${carpeta}`)}
            onSubir={() => {
              const partes = rutaGcs.split("/").filter(Boolean);
              partes.pop();
              setRutaGcs(partes.length ? `${partes.join("/")}/` : "");
            }}
            onDescargar={async (nombre) => {
              const base = explorador.data?.prefijoBase ?? "";
              const firmado = await firmarArchivoExploradorGcs(
                `${base}${rutaGcs}${nombre}`,
              );
              const enlace = document.createElement("a");
              enlace.href = firmado.url;
              enlace.download = firmado.nombre;
              enlace.rel = "noopener";
              enlace.click();
            }}
          />
        </>
      )}
    </PageLayout>
  );
}

function SeccionAdministracion({
  descargas,
}: {
  descargas: ResumenDescargaEjecucion[];
}) {
  const grupos = descargas.reduce<Record<string, ResumenDescargaEjecucion[]>>(
    (acumulado, descarga) => {
      const clave = descarga.creadoPorUsuarioId ?? "historico";
      (acumulado[clave] ??= []).push(descarga);
      return acumulado;
    },
    {},
  );
  return (
    <section className="mt-8 rounded-xl border border-line-200 bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-surface-subtle p-2 text-brand-700">
          <Icon name="users" />
        </div>
        <div>
          <h2 className="font-semibold text-ink-900">Carpetas de usuarios</h2>
          <p className="mt-1 text-sm text-ink-500">
            Vista administrativa de las ejecuciones de esta organización.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        {Object.entries(grupos).map(([propietario, items]) => (
          <div key={propietario} className="rounded-lg border border-line-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-800">
              <Icon name="folder" size="sm" />
              {propietario === "historico"
                ? "Histórico sin propietario"
                : `Usuario ${propietario.slice(0, 8)}`}
              <span className="font-normal text-ink-500">({items.length})</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((descarga) => (
                <TarjetaConDescarga key={descarga.id} descarga={descarga} />
              ))}
            </div>
          </div>
        ))}
        {descargas.length === 0 && (
          <p className="text-sm text-ink-500">No hay ejecuciones para administrar.</p>
        )}
      </div>
    </section>
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
      porcentaje={estado.porcentaje}
      bytesDescargados={estado.bytesDescargados}
      totalBytes={estado.totalBytes}
      totalArchivos={estado.totalArchivos}
      archivoActual={estado.archivoActual}
      error={estado.error}
      onDescargar={() => iniciarDescarga(descarga.id)}
      onDescargarArchivo={(nombre) => iniciarDescarga(descarga.id, nombre)}
      onCancelar={cancelar}
    />
  );
}

function SeccionExploradorGcs({
  datos,
  cargando,
  error,
  onAbrirCarpeta,
  onSubir,
  onDescargar,
}: {
  datos: Awaited<ReturnType<typeof listarExploradorGcs>>;
  cargando: boolean;
  error: string | null;
  onAbrirCarpeta: (carpeta: string) => void;
  onSubir: () => void;
  onDescargar: (nombre: string) => Promise<void>;
}) {
  if (!datos && !cargando && !error) return null;
  return (
    <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink-900">Google Cloud Storage</h2>
          {datos && (
            <p className="mt-1 text-xs text-ink-500">
              Bucket activo: <span className="font-mono">{datos.bucket}</span>
            </p>
          )}
        </div>
        {datos?.ruta && (
          <button
            type="button"
            className="text-sm font-semibold text-brand-700"
            onClick={onSubir}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="chev" size="sm" /> Subir
            </span>
          </button>
        )}
      </div>
      {datos && (
        <p className="mt-3 rounded-md bg-surface-subtle px-3 py-2 font-mono text-xs text-ink-600">
          /{datos.prefijoBase}
          {datos.ruta}
        </p>
      )}
      {cargando && (
        <p className="mt-4 text-sm text-ink-500">Consultando archivos...</p>
      )}
      {error && <p className="mt-4 text-sm text-danger-600">{error}</p>}
      {datos && !cargando && !error && (
        <div className="mt-4 space-y-2">
          {datos.carpetas.map((carpeta) => (
            <button
              key={carpeta}
              type="button"
              onClick={() => onAbrirCarpeta(carpeta)}
              className="flex w-full items-center gap-2 rounded-md border border-line-200 px-3 py-2 text-left text-sm font-medium text-ink-800 hover:bg-surface-subtle"
            >
              <Icon name="folder" size="sm" />
              <span className="truncate">{carpeta}</span>
            </button>
          ))}
          {datos.archivos.map((archivo) => (
            <div
              key={archivo.nombre}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-ink-800">
                  <Icon name="file-text" size="sm" />
                  <span className="truncate">{archivo.nombre}</span>
                </p>
                <p className="text-xs text-ink-500">
                  {archivo.formato} • {formatearTamano(archivo.tamano)}
                  {archivo.fecha
                    ? ` • ${formatearFechaISO(archivo.fecha)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-brand-700 hover:underline"
                onClick={() => void onDescargar(archivo.nombre)}
              >
                Descargar
              </button>
            </div>
          ))}
          {datos.carpetas.length === 0 && datos.archivos.length === 0 && (
            <p className="text-sm text-ink-500">
              Esta carpeta no contiene archivos descargables.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
