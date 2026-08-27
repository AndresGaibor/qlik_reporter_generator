import { Button } from "@/compartido/componentes/ui/button";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useQuery } from "@tanstack/react-query";
import { listarDescargasAdministracion } from "./api";
import { agruparEjecucionesPorReporte } from "./modelo-presentacion";
import { formatearFechaISO } from "./presentacion-ejecucion";

export function PaginaAdministracionDescargas() {
  const consulta = useQuery({
    queryKey: ["descargas", "administracion"],
    queryFn: listarDescargasAdministracion,
    retry: false,
  });
  const usuarios = new Map<
    string,
    {
      correo: string;
      ejecuciones: ReturnType<typeof agruparEjecucionesPorReporte>;
    }
  >();
  for (const ejecucion of consulta.data ?? []) {
    const correo =
      ejecucion.propietarioCorreo?.trim() || "Usuario sin identificar";
    const previo = usuarios.get(correo);
    const lista = [
      ...(previo?.ejecuciones.flatMap((reporte) => reporte.ejecuciones) ?? []),
      ejecucion,
    ];
    usuarios.set(correo, {
      correo,
      ejecuciones: agruparEjecucionesPorReporte(lista),
    });
  }
  return (
    <PageLayout>
      <PageHeader
        title="Administración de descargas"
        description="Consulta los resultados generados por otros usuarios y revisa incidencias de almacenamiento."
      />
      <div className="mb-5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.href = "/descargas";
          }}
        >
          Volver a mis descargas
        </Button>
      </div>
      {consulta.isLoading && (
        <output aria-live="polite">Cargando resultados…</output>
      )}
      {consulta.isError && (
        <div
          role="alert"
          className="rounded-lg bg-danger-50 p-4 text-danger-700"
        >
          No pudimos consultar los resultados administrativos.
        </div>
      )}
      {!consulta.isLoading && !consulta.isError && (
        <section>
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Resultados por usuario
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Los resultados están agrupados para no mezclar el contenido de cada
            cuenta.
          </p>
          <div className="mt-4 grid gap-3">
            {[...usuarios.values()].map((usuario) => {
              const ejecuciones = usuario.ejecuciones.flatMap(
                (reporte) => reporte.ejecuciones,
              );
              const ultima = ejecuciones.sort(
                (a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn),
              )[0];
              return (
                <article
                  key={usuario.correo}
                  className="rounded-xl border border-line-200 bg-surface p-5 shadow-card"
                >
                  <h3 className="font-semibold text-ink-900">
                    {usuario.correo}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {usuario.ejecuciones.length} reportes · {ejecuciones.length}{" "}
                    ejecuciones
                  </p>
                  {ultima && (
                    <p className="mt-1 text-xs text-ink-400">
                      Última actividad: {formatearFechaISO(ultima.creadoEn)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {usuarios.size === 0 && (
            <p className="mt-4 rounded-xl border border-dashed border-line-300 p-8 text-center text-sm text-ink-500">
              No hay resultados de otros usuarios.
            </p>
          )}
        </section>
      )}
    </PageLayout>
  );
}
