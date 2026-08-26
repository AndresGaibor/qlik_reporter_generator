import { Avatar, inicialesDe } from "@/compartido/componentes/ui/avatar";
import { Icon, type IconName } from "@/compartido/componentes/ui/icon";
import { Link, useLocation } from "@tanstack/react-router";
import type { RutaNav } from "./navegacion";

export function HeaderLink({
  to,
  etiqueta,
  icono,
}: { to: RutaNav; etiqueta: string; icono: IconName }) {
  const { pathname } = useLocation();
  const activo =
    to === "/"
      ? pathname === "/"
      : pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={[
        "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        activo
          ? "bg-brand-50 text-brand-800"
          : "text-ink-700 hover:bg-hover hover:text-ink-900",
      ].join(" ")}
    >
      <Icon
        name={icono}
        size="sm"
        className={activo ? "text-brand-600" : "text-ink-500"}
      />
      <span>{etiqueta}</span>
    </Link>
  );
}

export function BarraUsuario({
  nombre,
  avatarUrl,
  esAdmin,
  modoUsuarioFinal,
  onCambiarModoUsuarioFinal,
  onCerrarSesion,
}: {
  nombre: string;
  avatarUrl?: string;
  esAdmin: boolean;
  modoUsuarioFinal: boolean;
  onCambiarModoUsuarioFinal: (valor: boolean) => void;
  onCerrarSesion: () => void;
}) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-hover [&::-webkit-details-marker]:hidden">
        <Avatar iniciales={inicialesDe(nombre)} src={avatarUrl} tam="md" />
        <span className="hidden max-w-52 truncate font-semibold text-ink-900 lg:inline-block">
          {nombre}
        </span>
        <Icon
          name="chev"
          size="sm"
          className="-rotate-90 text-ink-400 transition group-open:rotate-90"
        />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-line-200 bg-surface p-2 shadow-panel">
        <div className="border-b border-line-200 px-3 py-2">
          <p className="truncate text-sm font-semibold text-ink-900">
            {nombre}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {esAdmin ? "Administrador" : "Usuario"}
          </p>
        </div>
        {esAdmin && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-ink-700 hover:bg-hover">
            <span>Previsualizar como usuario</span>
            <input
              type="checkbox"
              checked={modoUsuarioFinal}
              onChange={(evento) =>
                onCambiarModoUsuarioFinal(evento.target.checked)
              }
              className="h-4 w-4 rounded border-line-300 accent-[var(--color-brand-600)]"
            />
          </label>
        )}
        <button
          type="button"
          data-accion="cerrar-sesion"
          onClick={onCerrarSesion}
          className="mt-1 flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-ink-700 hover:bg-hover hover:text-ink-900"
        >
          Cerrar sesión
        </button>
      </div>
    </details>
  );
}
