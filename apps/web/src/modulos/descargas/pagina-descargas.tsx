import { useContextoVista } from "@/app/contexto-vista";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import {
  type CarpetaRegistradaGcs,
  type ExploradorGcs,
  type ResumenDescargaEjecucion,
  firmarArchivoCarpetaUsuarioGcs,
  firmarArchivoExploradorGcs,
  listarCarpetaUsuarioGcs,
  listarCarpetasUsuariosGcs,
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
import { useCallback, useEffect, useState } from "react";

export function PaginaDescargas() {
  const { mostrarError } = useNotificaciones();
  const { manejar } = useManejoError(mostrarError);
  const { esAdmin, modoUsuarioFinal } = useContextoVista();
  const puedeAdministrar = esAdmin && !modoUsuarioFinal;
  const [rutaCarpeta, setRutaCarpeta] = useRutaPersistidaEnUrl("carpeta");
  const [rutaGcs, setRutaGcs] = useRutaPersistidaEnUrl("almacenamiento");

  const { data: sesion } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
  });
  const correoUsuario = sesion?.usuario?.correo?.trim() ?? null;
  const carpetaUsuario = useQuery({
    queryKey: ["carpeta-usuario-gcs", rutaCarpeta],
    queryFn: () => listarCarpetaUsuarioGcs(rutaCarpeta),
    retry: false,
  });

  const carpetasUsuarios = useQuery({
    queryKey: ["carpetas-usuarios-gcs"],
    queryFn: listarCarpetasUsuariosGcs,
    retry: false,
    enabled: puedeAdministrar,
  });

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

      <section className="relative overflow-hidden rounded-xl border border-line-200 bg-surface p-5 shadow-card">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-50" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon name="folder" size="lg" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-ink-900">
                  {carpetaUsuario.data?.carpetaUsuario ?? "Tu carpeta"}
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-700">
                  <Icon name="shield" size="sm" />
                  Espacio privado
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-ink-500">
                Aquí se guardan únicamente tus ejecuciones y archivos generados.
                Nadie fuera de tu cuenta puede acceder a esta carpeta.
              </p>
              {correoUsuario && (
                <p className="mt-2 truncate text-xs text-ink-400">
                  {correoUsuario}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
            <MetricaCarpeta
              icono="file-text"
              etiqueta="Ejecuciones"
              valor={descargas.length}
            />
            <MetricaCarpeta
              icono="download"
              etiqueta="Archivos"
              valor={carpetaUsuario.data?.archivos.length ?? 0}
            />
          </div>
        </div>
      </section>

      <SeccionExploradorGcs
        titulo="Mi carpeta"
        descripcion="Navega por tus carpetas y descarga los archivos disponibles."
        nombreRaiz={carpetaUsuario.data?.carpetaUsuario ?? "Tu carpeta"}
        mostrarBucket={false}
        mostrarRutaTecnica={false}
        datos={carpetaUsuario.data ?? null}
        cargando={carpetaUsuario.isLoading}
        error={
          carpetaUsuario.error instanceof Error
            ? carpetaUsuario.error.message
            : null
        }
        onNavegarRuta={setRutaCarpeta}
        onAbrirCarpeta={(carpeta) => setRutaCarpeta(`${rutaCarpeta}${carpeta}`)}
        onSubir={() => {
          setRutaCarpeta(rutaPadre(rutaCarpeta));
        }}
        onDescargar={async (nombre) => {
          const firmado = await firmarArchivoCarpetaUsuarioGcs(
            `${rutaCarpeta}${nombre}`,
          );
          descargarDesdeEnlace(firmado);
        }}
      />

      <div className="mt-7 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
            Tu actividad
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-ink-900">
            Actividad reciente
          </h2>
        </div>
        <span className="text-sm text-ink-500">
          {descargas.length} {descargas.length === 1 ? "ejecución" : "ejecuciones"}
        </span>
      </div>
      {descargas.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line-300 bg-surface p-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-surface-subtle text-ink-400">
            <Icon name="folder" />
          </span>
          <p className="mt-3 font-medium text-ink-800">
            Aún no tienes reportes descargables
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Cuando ejecutes un reporte, sus archivos aparecerán automáticamente
            aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {descargas.map((descarga) => (
            <TarjetaConDescarga key={descarga.id} descarga={descarga} />
          ))}
        </div>
      )}

      {puedeAdministrar && (
        <>
          <SeccionCarpetasUsuariosGcs
            carpetas={carpetasUsuarios.data ?? []}
            onAbrir={(carpeta) => setRutaGcs(`${carpeta}/`)}
          />
          <SeccionAdministracion descargas={administracion.data ?? []} />
          <SeccionExploradorGcs
            titulo="Almacenamiento de reportes"
            descripcion="Explora la estructura técnica del almacenamiento cuando necesites revisar archivos o carpetas fuera de los accesos de usuario."
            nombreRaiz="Raíz de reportes"
            mostrarRutaTecnica
            datos={explorador.data ?? null}
            cargando={explorador.isLoading}
            error={
              explorador.error instanceof Error
                ? explorador.error.message
                : null
            }
            onNavegarRuta={setRutaGcs}
            onAbrirCarpeta={(carpeta) => setRutaGcs(`${rutaGcs}${carpeta}`)}
            onSubir={() => setRutaGcs(rutaPadre(rutaGcs))}
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

function useRutaPersistidaEnUrl(clave: "carpeta" | "almacenamiento") {
  const leer = useCallback(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get(clave) ?? "";
  }, [clave]);
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const sincronizar = () => setRuta(leer());
    window.addEventListener("popstate", sincronizar);
    return () => window.removeEventListener("popstate", sincronizar);
  }, [leer]);
  const establecer = useCallback((valor: string) => {
    const url = new URL(window.location.href);
    if (valor) url.searchParams.set(clave, valor);
    else url.searchParams.delete(clave);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setRuta(valor);
  }, [clave]);
  return [ruta, establecer] as const;
}

function rutaPadre(ruta: string) {
  const partes = ruta.split("/").filter(Boolean);
  partes.pop();
  return partes.length ? `${partes.join("/")}/` : "";
}

function descargarDesdeEnlace(firmado: { nombre: string; url: string }) {
  const enlace = document.createElement("a");
  enlace.href = firmado.url;
  enlace.download = firmado.nombre;
  enlace.rel = "noopener";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

function nombreDesdeCorreo(correo: string | null | undefined): string {
  const local = correo?.split("@")[0]?.trim();
  if (!local) return "Mi espacio";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(
      (parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase(),
    )
    .join(" ");
}

function MetricaCarpeta({
  icono,
  etiqueta,
  valor,
}: {
  icono: "file-text" | "download";
  etiqueta: string;
  valor: number;
}) {
  return (
    <div className="rounded-lg border border-line-200 bg-surface px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        <Icon name={icono} size="sm" />
        {etiqueta}
      </div>
      <p className="mt-1 text-lg font-semibold text-ink-900">{valor}</p>
    </div>
  );
}

function SeccionCarpetasUsuariosGcs({
  carpetas,
  onAbrir,
}: {
  carpetas: CarpetaRegistradaGcs[];
  onAbrir: (carpeta: string) => void;
}) {
  if (carpetas.length === 0) return null;
  return (
    <section className="mt-10 rounded-xl border border-line-200 bg-surface p-5 shadow-card">
      <h2 className="font-display text-lg font-semibold text-ink-900">
        Usuarios con almacenamiento
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Accede a los resultados de otros usuarios registrados sin mezclar su contenido con tu espacio personal.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {carpetas.map((item) => (
          <button
            key={item.usuarioId}
            type="button"
            onClick={() => onAbrir(item.carpeta)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-line-200 bg-surface px-4 py-4 text-left transition hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon name="folder" /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{item.carpeta}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-500">{item.correo}</span>
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 opacity-80 group-hover:opacity-100">Abrir <Icon name="chev" size="sm" className="rotate-180" /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SeccionAdministracion({
  descargas,
}: {
  descargas: ResumenDescargaEjecucion[];
}) {
  const asignadas = descargas.filter((item) => item.creadoPorUsuarioId);
  const historicas = descargas.filter((item) => !item.creadoPorUsuarioId);
  const grupos = asignadas.reduce<Record<string, ResumenDescargaEjecucion[]>>(
    (acumulado, descarga) => {
      const clave = descarga.creadoPorUsuarioId as string;
      const grupo = acumulado[clave] ?? [];
      grupo.push(descarga);
      acumulado[clave] = grupo;
      return acumulado;
    },
    {},
  );
  return (
    <section className="mt-10 rounded-xl border border-line-200 bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-700"><Icon name="users" /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink-900">Actividad de usuarios</h2>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">Solo administradores</span>
          </div>
          <p className="mt-1 text-sm text-ink-500">Revisa qué reportes ejecutó cada usuario, su estado y si ya existen resultados disponibles.</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {Object.entries(grupos).map(([propietario, items]) => (
          <div key={propietario} className="rounded-lg border border-line-200 bg-surface-subtle/40 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-800">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-brand-700 shadow-sm"><Icon name="user" size="sm" /></span>
              <span>{nombreDesdeCorreo(items[0]?.propietarioCorreo ?? null)}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-normal text-ink-500">{items.length} {items.length === 1 ? "ejecución" : "ejecuciones"}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((descarga) => <TarjetaConDescarga key={descarga.id} descarga={descarga} />)}
            </div>
          </div>
        ))}
        {asignadas.length === 0 && <p className="text-sm text-ink-500">No hay actividad de otros usuarios para mostrar.</p>}
      </div>
      {historicas.length > 0 && (
        <details className="mt-5 rounded-lg border border-line-200 bg-surface-subtle/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-800">Ejecuciones históricas no asignadas <span className="ml-2 font-normal text-ink-500">{historicas.length}</span></summary>
          <div className="grid gap-4 border-t border-line-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {historicas.map((descarga) => <TarjetaConDescarga key={descarga.id} descarga={descarga} />)}
          </div>
        </details>
      )}
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
  titulo = "Explorador",
  descripcion,
  nombreRaiz = "Raíz",
  mostrarBucket = true,
  mostrarRutaTecnica = false,
  datos,
  cargando,
  error,
  onAbrirCarpeta,
  onSubir,
  onDescargar,
  onNavegarRuta,
}: {
  titulo?: string;
  descripcion?: string;
  nombreRaiz?: string;
  mostrarBucket?: boolean;
  mostrarRutaTecnica?: boolean;
  datos: ExploradorGcs | null;
  cargando: boolean;
  error: string | null;
  onAbrirCarpeta: (carpeta: string) => void;
  onSubir: () => void;
  onDescargar: (nombre: string) => Promise<void>;
  onNavegarRuta?: (ruta: string) => void;
}) {
  if (!datos && !cargando && !error) return null;
  const segmentos = datos?.ruta.split("/").filter(Boolean) ?? [];
  return (
    <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon name="folder" /></span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink-900">{titulo}</h2>
            {descripcion && <p className="mt-1 max-w-3xl text-sm text-ink-500">{descripcion}</p>}
            {mostrarBucket && datos && <p className="mt-1 text-xs text-ink-400">Google Cloud Storage · <span className="font-mono">{datos.bucket}</span></p>}
          </div>
        </div>
        {datos?.ruta && <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={onSubir}><Icon name="chev" size="sm" /> Atrás</button>}
      </div>
      {datos && (
        <div className="mt-4">
          <nav aria-label="Ruta actual" className="flex flex-wrap items-center gap-1.5 text-sm">
            <button type="button" onClick={() => onNavegarRuta?.("")} className="font-semibold text-brand-700 hover:underline">{nombreRaiz}</button>
            {segmentos.map((segmento, indice) => {
              const ruta = `${segmentos.slice(0, indice + 1).join("/")}/`;
              return <span key={ruta} className="inline-flex items-center gap-1.5"><span className="text-ink-300">/</span><button type="button" onClick={() => onNavegarRuta?.(ruta)} className={indice === segmentos.length - 1 ? "font-semibold text-ink-800" : "text-brand-700 hover:underline"}>{segmento}</button></span>;
            })}
          </nav>
          {mostrarRutaTecnica && <p className="mt-2 truncate font-mono text-[11px] text-ink-400">/{datos.prefijoBase}{datos.ruta}</p>}
        </div>
      )}
      {cargando && <p className="mt-5 text-sm text-ink-500">Consultando archivos...</p>}
      {error && <p className="mt-5 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</p>}
      {datos && !cargando && !error && (
        <div className="mt-5 grid gap-2">
          {datos.carpetas.map((carpeta) => (
            <button key={carpeta} type="button" onClick={() => onAbrirCarpeta(carpeta)} className="group flex w-full items-center justify-between gap-3 rounded-lg border border-line-200 bg-surface px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40">
              <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon name="folder" size="sm" /></span><span className="truncate font-semibold text-ink-800">{carpeta.replace(/\/$/, "")}</span></span>
              <Icon name="chev" size="sm" className="rotate-180 text-ink-300 transition group-hover:text-brand-600" />
            </button>
          ))}
          {datos.archivos.map((archivo) => (
            <div key={archivo.nombre} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-200 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-ink-500"><Icon name="file-text" size="sm" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-800">{archivo.nombre}</p><p className="mt-0.5 text-xs text-ink-500">{archivo.formato} · {formatearTamano(archivo.tamano)}{archivo.fecha ? ` · ${formatearFechaISO(archivo.fecha)}` : ""}</p></div></div>
              <button type="button" className="rounded-md px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={() => void onDescargar(archivo.nombre)}><span className="inline-flex items-center gap-1.5"><Icon name="download" size="sm" /> Descargar</span></button>
            </div>
          ))}
          {datos.carpetas.length === 0 && datos.archivos.length === 0 && <div className="rounded-lg border border-dashed border-line-300 p-6 text-center text-sm text-ink-500">Esta carpeta está vacía.</div>}
        </div>
      )}
    </section>
  );
}
