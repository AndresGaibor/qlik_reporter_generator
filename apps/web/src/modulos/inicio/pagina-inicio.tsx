import { useVistaUsuarioFinal } from "@/app/contexto-vista";
import { Icon, type IconName } from "@/compartido/componentes/ui/icon";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

function Acceso({
  to,
  icono,
  titulo,
  descripcion,
}: {
  to: "/reportes" | "/descargas" | "/configuracion";
  icono: IconName;
  titulo: string;
  descripcion: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-28 items-center gap-4 rounded-lg border border-line-200 bg-surface p-5 transition-colors hover:border-line-300 hover:bg-surface-subtle"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-app text-ink-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
        <Icon name={icono} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-ink-900">
          {titulo}
        </span>
        <span className="mt-1 block text-sm leading-5 text-ink-500">
          {descripcion}
        </span>
      </span>
      <Icon
        name="chev"
        size="sm"
        className="rotate-180 text-ink-300 transition-colors group-hover:text-brand-600"
      />
    </Link>
  );
}

export function PaginaInicio() {
  const modoUsuarioFinal = useVistaUsuarioFinal();
  const { data: sesion } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
  });
  const tenantActivo = sesion?.tenantsDisponibles.find(
    (tenant) => tenant.id === sesion?.tenantActivoId,
  );
  const esAdmin =
    (sesion?.esSuperadmin ?? false) ||
    (sesion?.membresias ?? []).some((membresia) => membresia.rol === "admin");

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <header className="border-b border-line-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
          Inicio
        </p>
        <h1 className="mt-1 font-display text-display font-semibold tracking-tight text-ink-900">
          Bienvenido a Qlik Report
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">
          Ejecuta tus reportes y accede a los archivos generados desde un solo
          lugar.
        </p>
        {tenantActivo && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-600">
            <Icon name="cloud" size="sm" className="text-obj-600" />
            <span>
              {tenantActivo.organizacionNombre ??
                tenantActivo.nombre ??
                tenantActivo.host}
            </span>
            {esAdmin && !modoUsuarioFinal && (
              <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                Administrador
              </span>
            )}
          </div>
        )}
      </header>

      <section className="mt-7">
        <h2 className="text-lg font-semibold text-ink-900">
          ¿Qué necesitas hacer?
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Acceso
            to="/reportes"
            icono="file-text"
            titulo="Reportes"
            descripcion="Consulta y ejecuta los reportes disponibles."
          />
          <Acceso
            to="/descargas"
            icono="download"
            titulo="Descargas"
            descripcion="Consulta y descarga los archivos de tus ejecuciones."
          />
        </div>
      </section>

      {esAdmin && !modoUsuarioFinal && (
        <section className="mt-8 border-t border-line-200 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-400">
            Administración
          </p>
          <Acceso
            to="/configuracion"
            icono="admin"
            titulo="Configuración de la plataforma"
            descripcion="Administra conexiones, acceso y permisos de usuarios."
          />
        </section>
      )}
    </div>
  );
}
