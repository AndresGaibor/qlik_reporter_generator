import { useContextoVista } from "@/app/contexto-vista";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { ConfirmDialog } from "@/compartido/componentes/ui/confirm-dialog";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useManejoError } from "@/compartido/hooks/use-manejo-error";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import {
  type CarpetaRegistradaGcs,
  type CarpetaUsuarioGcs,
  type ExploradorGcs,
  eliminarArchivoCarpetaUsuarioGcs,
  eliminarDirectorioCarpetaUsuarioGcs,
  firmarArchivoCarpetaUsuarioGcs,
  firmarArchivoExploradorGcs,
  guardarCompartidoDescarga,
  listarCarpetaUsuarioGcs,
  listarCarpetasUsuariosGcs,
  listarDescargas,
  listarExploradorGcs,
  listarPartesNormalizadas,
  listarUsuariosCompartibles,
  obtenerCompartidoDescarga,
  urlCsvParteCarpetaUsuarioGcs,
  urlZipCarpetaUsuarioGcs,
  urlZipEjecucion,
} from "@/modulos/descargas/api";
import {
  formatearFechaISO,
  formatearTamano,
} from "@/modulos/descargas/presentacion-ejecucion";
import type {
  ResumenDescargaEjecucion,
  UsuarioCompartible,
} from "@qlik/contratos/descargas";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export function PaginaDescargas() {
  const { mostrarError, mostrarExito } = useNotificaciones();
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
  const descargas = useQuery({
    queryKey: ["descargas-compartidas"],
    queryFn: listarDescargas,
    retry: false,
  });
  const [compartiendo, setCompartiendo] =
    useState<ResumenDescargaEjecucion | null>(null);

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

  const [eliminacion, setEliminacion] = useState<{
    tipo: "archivo" | "carpeta";
    nombre: string;
    ruta: string;
  } | null>(null);

  async function confirmarEliminacion() {
    const pendiente = eliminacion;
    if (!pendiente) return;
    setEliminacion(null);
    try {
      if (pendiente.tipo === "archivo") {
        await eliminarArchivoCarpetaUsuarioGcs(pendiente.ruta);
        mostrarExito(`Archivo "${pendiente.nombre}" eliminado.`);
      } else {
        await eliminarDirectorioCarpetaUsuarioGcs(pendiente.ruta);
        mostrarExito(
          `Carpeta "${pendiente.nombre}" eliminada con su contenido.`,
        );
      }
      await carpetaUsuario.refetch();
    } catch (error) {
      manejar(
        error instanceof Error
          ? error
          : new Error("No se pudo eliminar el elemento."),
      );
    }
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
                  Acceso controlado
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-ink-500">
                Aquí se integran tus ejecuciones y las que compartieron contigo.
                Solo acceden las personas seleccionadas o tu organización.
              </p>
              {correoUsuario && (
                <p className="mt-2 truncate text-xs text-ink-400">
                  {correoUsuario}
                </p>
              )}
            </div>
          </div>
          <div className="sm:min-w-[150px]">
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
        mostrarEjecucionesAmigables
        ejecucionesAccesibles={descargas.data ?? []}
        usuarioId={sesion?.usuario?.id ?? null}
        datos={carpetaUsuario.data ?? null}
        cargando={carpetaUsuario.isLoading}
        error={
          carpetaUsuario.error instanceof Error
            ? carpetaUsuario.error.message
            : null
        }
        onNavegarRuta={setRutaCarpeta}
        onAbrirCarpeta={(carpeta) => setRutaCarpeta(`${rutaCarpeta}${carpeta}`)}
        onCompartirEjecucion={setCompartiendo}
        onSubir={() => {
          setRutaCarpeta(rutaPadre(rutaCarpeta));
        }}
        puedeEliminar={puedeAdministrar}
        urlDescargarTodo={urlZipCarpetaUsuarioGcs(rutaCarpeta)}
        onEliminarArchivo={(nombre) =>
          setEliminacion({
            tipo: "archivo",
            nombre,
            ruta: `${rutaCarpeta}${nombre}`,
          })
        }
        onEliminarCarpeta={(carpeta) =>
          setEliminacion({
            tipo: "carpeta",
            nombre: carpeta.replace(/\/$/, ""),
            ruta: `${rutaCarpeta}${carpeta}`,
          })
        }
        onDescargar={async (nombre) => {
          if (/\.csv$/i.test(nombre)) {
            descargarDesdeEnlace({
              nombre,
              url: urlCsvParteCarpetaUsuarioGcs(rutaCarpeta, nombre),
            });
            return;
          }
          const firmado = await firmarArchivoCarpetaUsuarioGcs(
            `${rutaCarpeta}${nombre}`,
          );
          descargarDesdeEnlace(firmado);
        }}
      />

      {puedeAdministrar && (
        <>
          <SeccionCarpetasUsuariosGcs
            carpetas={carpetasUsuarios.data ?? []}
            onAbrir={(carpeta) => setRutaGcs(`${carpeta}/`)}
          />
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
      <ConfirmDialog
        open={Boolean(eliminacion)}
        variant="danger"
        titulo={
          eliminacion?.tipo === "carpeta"
            ? "Eliminar carpeta y todo su contenido"
            : "Eliminar archivo"
        }
        mensaje={
          eliminacion?.tipo === "carpeta"
            ? `Se eliminará "${eliminacion?.nombre}" y todos los archivos y subcarpetas que contiene. Esta acción no se puede deshacer.`
            : `¿Eliminar "${eliminacion?.nombre ?? ""}"? Esta acción no se puede deshacer.`
        }
        confirmText={
          eliminacion?.tipo === "carpeta"
            ? "Eliminar carpeta y todo su contenido"
            : "Eliminar archivo"
        }
        onCancel={() => setEliminacion(null)}
        onConfirm={() => void confirmarEliminacion()}
      />
      {compartiendo && (
        <ModalCompartirDescarga
          descarga={compartiendo}
          onCerrar={() => setCompartiendo(null)}
          onGuardado={() => {
            setCompartiendo(null);
            mostrarExito("Acceso actualizado.");
            void descargas.refetch();
          }}
          onError={manejar}
        />
      )}
    </PageLayout>
  );
}

function ModalCompartirDescarga({
  descarga,
  onCerrar,
  onGuardado,
  onError,
}: {
  descarga: ResumenDescargaEjecucion;
  onCerrar: () => void;
  onGuardado: () => void;
  onError: (error: Error) => void;
}) {
  const usuarios = useQuery({
    queryKey: ["usuarios-compartibles"],
    queryFn: listarUsuariosCompartibles,
  });
  const compartido = useQuery({
    queryKey: ["descarga-compartida", descarga.id],
    queryFn: () => obtenerCompartidoDescarga(descarga.id),
  });
  const [seleccion, setSeleccion] = useState<string[] | null>(null);
  const [todaOrganizacion, setTodaOrganizacion] = useState<boolean | null>(
    null,
  );
  const [guardando, setGuardando] = useState(false);
  const seleccionActual = seleccion ?? compartido.data?.usuarios ?? [];
  const todaActual =
    todaOrganizacion ?? compartido.data?.todaOrganizacion ?? false;

  async function guardar() {
    setGuardando(true);
    try {
      await guardarCompartidoDescarga(descarga.id, {
        todaOrganizacion: todaActual,
        usuarios: todaActual ? [] : seleccionActual,
      });
      onGuardado();
    } catch (error) {
      onError(
        error instanceof Error ? error : new Error("No se pudo compartir"),
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none place-items-center border-0 bg-black/40 p-4 open:grid"
      aria-labelledby="titulo-compartir-descarga"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2
          id="titulo-compartir-descarga"
          className="font-display text-lg font-semibold text-ink-900"
        >
          Compartir {descarga.reporteNombre}
        </h2>
        <label className="mt-4 flex items-center gap-3 rounded-lg border border-line-200 p-3">
          <input
            type="checkbox"
            checked={todaActual}
            onChange={(evento) => setTodaOrganizacion(evento.target.checked)}
          />
          <span>Todas las personas de la organización</span>
        </label>
        {!todaActual && (
          <div className="mt-3 space-y-2">
            {(usuarios.data ?? []).map((usuario: UsuarioCompartible) => (
              <label
                key={usuario.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={seleccionActual.includes(usuario.id)}
                  onChange={(evento) =>
                    setSeleccion(
                      evento.target.checked
                        ? [...seleccionActual, usuario.id]
                        : seleccionActual.filter((id) => id !== usuario.id),
                    )
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    {usuario.nombre}
                  </span>
                  <span className="block text-xs text-ink-400">
                    {usuario.correo}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={guardando || compartido.isLoading || usuarios.isLoading}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function CarpetaCompartida({
  descarga,
}: {
  descarga: ResumenDescargaEjecucion;
}) {
  const [abierta, setAbierta] = useState(false);
  const partes = useQuery({
    queryKey: ["archivos-descarga-compartida", descarga.id],
    queryFn: () => listarPartesNormalizadas(descarga.id),
    enabled: abierta,
    retry: false,
  });
  useEffect(() => {
    if (!abierta || partes.data?.estado !== "preparando") return;
    const temporizador = window.setTimeout(() => void partes.refetch(), 2_000);
    return () => window.clearTimeout(temporizador);
  }, [abierta, partes.data?.estado, partes.refetch]);

  return (
    <div className="rounded-lg border border-line-200 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon name="folder" size="sm" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-800">
              {descarga.reporteNombre}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              Compartida por {descarga.propietarioCorreo ?? "otro usuario"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAbierta(!abierta)}
        >
          {abierta ? "Ocultar archivos" : "Ver archivos"}
        </Button>
      </div>
      {abierta && (
        <div className="divide-y divide-line-200 border-t border-line-200 bg-surface-subtle/40 px-4">
          {(partes.isLoading || partes.data?.estado === "preparando") && (
            <p className="py-3 text-sm text-ink-500">Consultando archivos…</p>
          )}
          {partes.isError && (
            <p className="py-3 text-sm text-danger-600">
              {partes.error.message}
            </p>
          )}
          {(partes.data?.partes.length ?? 0) > 0 && (
            <p className="py-3 text-sm font-semibold text-ink-800">
              {partes.data?.partes.length} archivos ·{" "}
              {formatearTamano(
                partes.data?.partes.reduce(
                  (total, parte) => total + parte.tamano,
                  0,
                ) ?? 0,
              )}
            </p>
          )}
          {(partes.data?.partes ?? []).map((parte) => (
            <div
              key={parte.nombre}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-800">
                  {parte.nombre}
                </p>
                <p className="text-xs text-ink-500">
                  CSV normalizado · {formatearTamano(parte.tamano)}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={parte.url}>
                  <Icon name="download" size="sm" /> Descargar
                </a>
              </Button>
            </div>
          ))}
          {partes.data?.estado === "lista" && (
            <div className="flex justify-end py-3">
              <Button asChild>
                <a href={urlZipEjecucion(descarga.id)}>
                  <Icon name="download" size="sm" /> Descargar ZIP normalizado
                </a>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartesNormalizadas({ ejecucionId }: { ejecucionId: string }) {
  const partes = useQuery({
    queryKey: ["partes-normalizadas", ejecucionId],
    queryFn: () => listarPartesNormalizadas(ejecucionId),
    retry: false,
  });
  useEffect(() => {
    if (partes.data?.estado !== "preparando") return;
    const temporizador = window.setTimeout(() => void partes.refetch(), 2_000);
    return () => window.clearTimeout(temporizador);
  }, [partes.data?.estado, partes.refetch]);
  if (partes.isLoading)
    return <p className="text-sm text-ink-500">Preparando archivos...</p>;
  if (partes.isError)
    return <p className="text-sm text-danger-600">{partes.error.message}</p>;
  return (
    <>
      {partes.data?.estado === "preparando" && (
        <p className="text-sm text-ink-500">
          Preparando archivos; los terminados ya se pueden descargar.
        </p>
      )}
      {(partes.data?.partes.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3">
          <p className="text-sm font-semibold text-ink-800">
            {partes.data?.partes.length} archivos ·{" "}
            {formatearTamano(
              partes.data?.partes.reduce(
                (total, parte) => total + parte.tamano,
                0,
              ) ?? 0,
            )}
          </p>
          {partes.data?.estado === "lista" && (
            <a
              href={urlZipEjecucion(ejecucionId)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Icon name="download" size="sm" /> Descargar todo (.zip)
            </a>
          )}
        </div>
      )}
      {(partes.data?.partes ?? []).map((parte) => (
        <div
          key={parte.nombre}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-200 px-4 py-3"
        >
          <div>
            <p className="text-sm font-semibold text-ink-800">{parte.nombre}</p>
            <p className="text-xs text-ink-500">
              CSV normalizado · {formatearTamano(parte.tamano)}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={parte.url}>
              <Icon name="download" size="sm" /> Descargar
            </a>
          </Button>
        </div>
      ))}
    </>
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
  const establecer = useCallback(
    (valor: string) => {
      const url = new URL(window.location.href);
      if (valor) url.searchParams.set(clave, valor);
      else url.searchParams.delete(clave);
      window.history.pushState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      setRuta(valor);
    },
    [clave],
  );
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

function esUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor,
  );
}

function abreviarUuid(valor: string) {
  return `${valor.slice(0, 8)}…`;
}

function etiquetaSegmentoRuta(
  segmento: string,
  indice: number,
  total: number,
  ejecucionActual: { ejecucionId: string; ejecutadoEn: string } | null,
) {
  const esActual = indice === total - 1;
  if (esActual && ejecucionActual?.ejecucionId === segmento) {
    return `Ejecución · ${formatearFechaISO(ejecucionActual.ejecutadoEn)}`;
  }
  if (esActual && esUuid(segmento)) {
    return `Ejecución ${abreviarUuid(segmento)}`;
  }
  return segmento;
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
        Accede a los resultados de otros usuarios registrados sin mezclar su
        contenido con tu espacio personal.
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
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon name="folder" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">
                  {item.carpeta}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {item.correo}
                </span>
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 opacity-80 group-hover:opacity-100">
              Abrir <Icon name="chev" size="sm" className="rotate-180" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SeccionExploradorGcs({
  titulo = "Explorador",
  descripcion,
  nombreRaiz = "Raíz",
  mostrarBucket = true,
  mostrarRutaTecnica = false,
  mostrarEjecucionesAmigables = false,
  ejecucionesAccesibles = [],
  usuarioId,
  datos,
  cargando,
  error,
  onAbrirCarpeta,
  onCompartirEjecucion,
  onSubir,
  onDescargar,
  onNavegarRuta,
  puedeEliminar = false,
  onEliminarArchivo,
  onEliminarCarpeta,
  urlDescargarTodo,
}: {
  titulo?: string;
  descripcion?: string;
  nombreRaiz?: string;
  mostrarBucket?: boolean;
  mostrarRutaTecnica?: boolean;
  mostrarEjecucionesAmigables?: boolean;
  ejecucionesAccesibles?: ResumenDescargaEjecucion[];
  usuarioId?: string | null;
  datos: ExploradorGcs | CarpetaUsuarioGcs | null;
  cargando: boolean;
  error: string | null;
  onAbrirCarpeta: (carpeta: string) => void;
  onCompartirEjecucion?: (ejecucion: ResumenDescargaEjecucion) => void;
  onSubir: () => void;
  onDescargar: (nombre: string) => Promise<void>;
  onNavegarRuta?: (ruta: string) => void;
  puedeEliminar?: boolean;
  onEliminarArchivo?: (nombre: string) => void;
  onEliminarCarpeta?: (carpeta: string) => void;
  urlDescargarTodo?: string;
}) {
  if (!datos && !cargando && !error) return null;
  const segmentos = datos?.ruta.split("/").filter(Boolean) ?? [];
  const datosUsuario =
    mostrarEjecucionesAmigables && datos && "carpetaUsuario" in datos
      ? datos
      : null;
  const ejecucionPorCarpeta = new Map(
    (datosUsuario?.carpetasEjecucion ?? []).map((item) => [item.carpeta, item]),
  );
  const descargaPorId = new Map(
    ejecucionesAccesibles.map((ejecucion) => [ejecucion.id, ejecucion]),
  );
  const compartidasAjenas =
    segmentos.length === 0
      ? ejecucionesAccesibles.filter(
          (ejecucion) =>
            Boolean(ejecucion.creadoPorUsuarioId) &&
            ejecucion.creadoPorUsuarioId !== usuarioId,
        )
      : [];
  const esCarpetaEjecucion =
    mostrarEjecucionesAmigables && segmentos.some(esUuid);
  return (
    <section className="rounded-xl border border-line-200 bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Icon name="folder" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              {titulo}
            </h2>
            {descripcion && (
              <p className="mt-1 max-w-3xl text-sm text-ink-500">
                {descripcion}
              </p>
            )}
            {mostrarBucket && datos && (
              <p className="mt-1 text-xs text-ink-400">
                Google Cloud Storage ·{" "}
                <span className="font-mono">{datos.bucket}</span>
              </p>
            )}
          </div>
        </div>
        {datos?.ruta && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            onClick={onSubir}
          >
            <Icon name="chev" size="sm" /> Atrás
          </button>
        )}
      </div>
      {datos && (
        <div className="mt-4">
          <nav
            aria-label="Ruta actual"
            className="flex flex-wrap items-center gap-1.5 text-sm"
          >
            <button
              type="button"
              onClick={() => onNavegarRuta?.("")}
              className="font-semibold text-brand-700 hover:underline"
            >
              {nombreRaiz}
            </button>
            {segmentos.map((segmento, indice) => {
              const ruta = `${segmentos.slice(0, indice + 1).join("/")}/`;
              return (
                <span key={ruta} className="inline-flex items-center gap-1.5">
                  <span className="text-ink-300">/</span>
                  <button
                    type="button"
                    onClick={() => onNavegarRuta?.(ruta)}
                    className={
                      indice === segmentos.length - 1
                        ? "font-semibold text-ink-800"
                        : "text-brand-700 hover:underline"
                    }
                  >
                    {etiquetaSegmentoRuta(
                      segmento,
                      indice,
                      segmentos.length,
                      datosUsuario?.ejecucionActual ?? null,
                    )}
                  </button>
                </span>
              );
            })}
          </nav>
          {mostrarRutaTecnica && (
            <p className="mt-2 truncate font-mono text-[11px] text-ink-400">
              /{datos.prefijoBase}
              {datos.ruta}
            </p>
          )}
          {!esCarpetaEjecucion &&
            urlDescargarTodo &&
            datos.archivos.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3">
                <p className="text-sm font-semibold text-ink-800">
                  {datos.archivos.length}{" "}
                  {datos.archivos.length === 1 ? "archivo" : "archivos"} ·{" "}
                  {formatearTamano(
                    datos.archivos.reduce(
                      (total, archivo) => total + archivo.tamano,
                      0,
                    ),
                  )}
                </p>
                <a
                  href={urlDescargarTodo}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Icon name="download" size="sm" /> Descargar todo (.zip)
                </a>
              </div>
            )}
        </div>
      )}
      {cargando && (
        <p className="mt-5 text-sm text-ink-500">Consultando archivos...</p>
      )}
      {error && (
        <p className="mt-5 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
          {error}
        </p>
      )}
      {datos && !cargando && !error && (
        <div className="mt-5 grid gap-2">
          {datos.carpetas.map((carpeta) => {
            const ejecucion = ejecucionPorCarpeta.get(carpeta);
            const nombreCarpeta = carpeta.replace(/\/$/, "");
            const pareceEjecucion = esUuid(nombreCarpeta);
            const descarga = descargaPorId.get(nombreCarpeta);
            return (
              <div
                key={carpeta}
                className="group flex w-full items-center gap-2 rounded-lg border border-line-200 bg-surface p-1.5 transition hover:border-brand-200 hover:bg-brand-50/30"
              >
                <button
                  type="button"
                  onClick={() => onAbrirCarpeta(carpeta)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon name="folder" size="sm" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-ink-800">
                          {ejecucion
                            ? formatearFechaISO(ejecucion.ejecutadoEn)
                            : pareceEjecucion
                              ? `Ejecución ${abreviarUuid(nombreCarpeta)}`
                              : nombreCarpeta}
                        </span>
                        {ejecucion?.esMasReciente && (
                          <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                            Más reciente
                          </span>
                        )}
                      </span>
                      {(ejecucion || pareceEjecucion) && (
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {ejecucion
                            ? "Ejecución del reporte"
                            : "Sin fecha registrada"}
                        </span>
                      )}
                    </span>
                  </span>
                  <Icon
                    name="chev"
                    size="sm"
                    className="rotate-180 text-ink-300 transition group-hover:text-brand-600"
                  />
                </button>
                {puedeEliminar && (
                  <button
                    type="button"
                    onClick={() => onEliminarCarpeta?.(carpeta)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-danger-600 hover:bg-danger-50"
                  >
                    <Icon name="trash" size="sm" /> Eliminar
                  </button>
                )}
                {descarga?.creadoPorUsuarioId === usuarioId && (
                  <button
                    type="button"
                    onClick={() => descarga && onCompartirEjecucion?.(descarga)}
                    className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    Compartir
                  </button>
                )}
              </div>
            );
          })}
          {compartidasAjenas.map((descarga) => (
            <CarpetaCompartida
              key={`compartida-${descarga.id}`}
              descarga={descarga}
            />
          ))}
          {!esCarpetaEjecucion &&
            datos.archivos.map((archivo) => (
              <div
                key={archivo.nombre}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-200 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-ink-500">
                    <Icon name="file-text" size="sm" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-800">
                      {archivo.nombre}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {archivo.formato} · {formatearTamano(archivo.tamano)}
                      {archivo.fecha
                        ? ` · ${formatearFechaISO(archivo.fecha)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                    onClick={() => void onDescargar(archivo.nombre)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="download" size="sm" /> Descargar
                    </span>
                  </button>
                  {puedeEliminar && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-danger-600 hover:bg-danger-50"
                      onClick={() => onEliminarArchivo?.(archivo.nombre)}
                    >
                      <Icon name="trash" size="sm" /> Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          {esCarpetaEjecucion && datosUsuario?.ejecucionActual && (
            <PartesNormalizadas
              ejecucionId={datosUsuario.ejecucionActual.ejecucionId}
            />
          )}
          {!esCarpetaEjecucion &&
            datos.carpetas.length === 0 &&
            datos.archivos.length === 0 && (
              <div className="rounded-lg border border-dashed border-line-300 p-6 text-center">
                {mostrarEjecucionesAmigables && segmentos.length === 1 ? (
                  <>
                    <p className="text-sm font-semibold text-ink-800">
                      Aún no hay descargas para este reporte
                    </p>
                    <p className="mt-1 text-sm text-ink-500">
                      Ejecuta el reporte para generar la primera.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-500">
                    Esta carpeta está vacía.
                  </p>
                )}
              </div>
            )}
        </div>
      )}
    </section>
  );
}
