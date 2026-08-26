import { ErrorClienteApi } from "@/compartido/api/cliente";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import { ContextSwitcher } from "@/compartido/componentes/ui/context-switcher";
import { Icon, IconSprite } from "@/compartido/componentes/ui/icon";
import { MarcaQlikReport } from "@/compartido/componentes/ui/marca-qlik-report";
import {
  cambiarTenantActivo,
  cerrarSesion,
  obtenerSesion,
} from "@/modulos/autenticacion/api";
import { obtenerEstadoSetup } from "@/modulos/setup/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarraUsuario, HeaderLink } from "./componentes-header";
import { VistaContext } from "./contexto-vista";
import { NAVEGACION } from "./navegacion";

export function LayoutPrincipal() {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const ubicacion = useLocation();
  const { mostrarError } = useNotificaciones();
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [modoUsuarioFinal, setModoUsuarioFinal] = useState(false);

  const esLogin = ubicacion.pathname === "/login";
  const esSetup = ubicacion.pathname === "/setup";

  const consultaSetup = useQuery({
    queryKey: ["setup-status"],
    queryFn: obtenerEstadoSetup,
    retry: false,
  });

  const consulta = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    retry: false,
    enabled: !esLogin && !esSetup,
  });

  useEffect(() => {
    if (consultaSetup.data?.needsSetup === true && !esSetup) {
      navegar({ to: "/setup", replace: true });
    }
    if (consultaSetup.data?.needsSetup === false && esSetup) {
      navegar({ to: "/login", replace: true });
    }
  }, [consultaSetup.data, esSetup, navegar]);

  const cambiarTenant = useMutation({
    mutationFn: cambiarTenantActivo,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => mostrarError(error.message),
  });
  const cerrar = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: async () => {
      queryClient.clear();
      navegar({ to: "/login", replace: true });
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  useEffect(() => {
    if (!esLogin && consulta.error instanceof ErrorClienteApi) {
      if (consulta.error.estado === 401)
        navegar({ to: "/login", replace: true });
      else mostrarError(consulta.error.message);
    }
  }, [consulta.error, esLogin, mostrarError, navegar]);

  useEffect(() => {
    const sesion = consulta.data;
    if (!sesion) return;

    const esSuperadmin = sesion.esSuperadmin ?? false;
    const esAdmin =
      esSuperadmin || sesion.membresias.some((m) => m.rol === "admin");
    const puedeVerAdministracion = esAdmin && !modoUsuarioFinal;
    const estaEnRutaAdministrativa =
      ubicacion.pathname === "/configuracion" ||
      ubicacion.pathname.startsWith("/admin/");

    if (estaEnRutaAdministrativa && !puedeVerAdministracion) {
      navegar({ to: "/reportes", replace: true });
    }
  }, [consulta.data, modoUsuarioFinal, ubicacion.pathname, navegar]);

  if (consultaSetup.isLoading) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-app px-4">
        <p className="text-ink-500" aria-live="polite">
          Verificando configuración…
        </p>
      </div>
    );
  }

  if (consultaSetup.data?.needsSetup === true) {
    return <Outlet />;
  }

  if (esSetup) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-app px-4">
        <p className="text-ink-500" aria-live="polite">
          Redirigiendo…
        </p>
      </div>
    );
  }

  if (esLogin) return <Outlet />;

  if (consulta.isError) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-app px-4">
        <div
          className="max-w-md rounded-lg border border-danger-200 bg-surface p-6 text-center shadow-card"
          role="alert"
        >
          <h1 className="font-semibold text-ink-900">
            No pudimos verificar tu sesión
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {consulta.error instanceof Error
              ? consulta.error.message
              : "Intenta nuevamente."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => consulta.refetch()}>
              Reintentar
            </Button>
            <Button onClick={() => navegar({ to: "/login", replace: true })}>
              Ir al inicio de sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (consulta.isLoading || !consulta.data) {
    return (
      <div className="ambient flex min-h-screen items-center justify-center bg-app px-4">
        <p className="text-ink-500" aria-live="polite">
          Verificando sesión…
        </p>
      </div>
    );
  }

  const sesion = consulta.data;
  const tenantsDisponibles = Array.from(
    new Map(
      sesion.tenantsDisponibles.map((tenant) => [tenant.id, tenant]),
    ).values(),
  );
  const esSuperadmin = sesion.esSuperadmin ?? false;
  const esAdmin =
    esSuperadmin || sesion.membresias.some((m) => m.rol === "admin");
  const puedeVerAdministracion = esAdmin && !modoUsuarioFinal;
  const nombre = sesion.usuario?.nombre?.trim() || "Usuario Qlik";

  return (
    <div className="ambient min-h-screen overflow-x-hidden bg-app text-ink-900">
      <IconSprite />
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-200 bg-surface/98 px-4 backdrop-blur sm:px-6">
          <div className="flex shrink-0 items-center border-r border-line-200 pr-4">
            <MarcaQlikReport tam="sm" />
          </div>

          <nav
            className="hidden items-center gap-1.5 md:flex"
            aria-label="Navegación principal"
          >
            {NAVEGACION.filter((item) => {
              if (item.superadmin && (!esSuperadmin || !puedeVerAdministracion))
                return false;
              if (item.admin && !puedeVerAdministracion) return false;
              return true;
            }).map((item) => (
              <HeaderLink key={item.to} {...item} />
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            {tenantsDisponibles.length > 1 && (
              <ContextSwitcher
                tenants={tenantsDisponibles}
                activoId={sesion.tenantActivoId}
                cargando={cambiarTenant.isPending}
                onCambiar={(id) => cambiarTenant.mutate(id)}
              />
            )}

            <BarraUsuario
              nombre={nombre}
              avatarUrl={sesion.usuario?.avatarUrl ?? undefined}
              esAdmin={esAdmin}
              modoUsuarioFinal={modoUsuarioFinal}
              onCambiarModoUsuarioFinal={setModoUsuarioFinal}
              onCerrarSesion={() => cerrar.mutate()}
            />
          </div>

          <button
            type="button"
            className="ml-auto grid h-10 w-10 place-items-center rounded-md text-ink-700 hover:bg-hover md:hidden"
            aria-label={
              menuMovilAbierto
                ? "Cerrar menú de navegación"
                : "Abrir menú de navegación"
            }
            aria-expanded={menuMovilAbierto}
            aria-controls="navegacion-movil"
            onClick={() => setMenuMovilAbierto((abierto) => !abierto)}
          >
            <span aria-hidden className="text-xl">
              <Icon name={menuMovilAbierto ? "x" : "rows"} size="sm" />
            </span>
          </button>
        </header>

        {menuMovilAbierto && (
          <div
            id="navegacion-movil"
            className="border-b border-line-200 bg-surface p-3 md:hidden"
          >
            <nav className="grid gap-1" aria-label="Navegación móvil">
              {NAVEGACION.filter(
                (item) =>
                  (!item.superadmin ||
                    (esSuperadmin && puedeVerAdministracion)) &&
                  (!item.admin || puedeVerAdministracion),
              ).map((item) => (
                <HeaderLink key={item.to} {...item} />
              ))}
            </nav>
            {esAdmin && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-line-200 pt-3 text-sm font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={modoUsuarioFinal}
                  onChange={(evento) =>
                    setModoUsuarioFinal(evento.target.checked)
                  }
                  className="h-4 w-4 rounded border-line-300 accent-[var(--color-brand-600)]"
                />
                Previsualizar como usuario
              </label>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-line-200 pt-3">
              <span className="truncate text-sm font-medium">{nombre}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cerrar.mutate()}
              >
                Cerrar sesión
              </Button>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
          <VistaContext.Provider value={{ modoUsuarioFinal, esAdmin }}>
            <Outlet />
          </VistaContext.Provider>
        </main>
      </div>
    </div>
  );
}
