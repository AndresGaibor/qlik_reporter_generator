import { Avatar, inicialesDe } from "@/compartido/componentes/ui/avatar";
import { Button } from "@/compartido/componentes/ui/button";
import { ContextSwitcher } from "@/compartido/componentes/ui/context-switcher";
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
        "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-soft font-medium",
        activo
          ? "bg-brand-50 text-brand-700 font-semibold"
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
    <div className="flex items-center gap-4">
      {esAdmin && (
        <label
          className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-600"
          title="Oculta las opciones administrativas para previsualizar la vista del usuario final"
        >
          <input
            type="checkbox"
            checked={modoUsuarioFinal}
            onChange={(evento) =>
              onCambiarModoUsuarioFinal(evento.target.checked)
            }
            className="h-4 w-4 rounded border-line-300 accent-[var(--color-brand-600)]"
          />
          <span className="hidden xl:inline">Vista usuario final</span>
        </label>
      )}

      <div className="flex items-center gap-2.5 border-l border-line-200 pl-4">
        <Avatar iniciales={inicialesDe(nombre)} src={avatarUrl} tam="md" />
        <span className="hidden text-sm font-semibold text-ink-900 lg:inline-block">
          {nombre}
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        data-accion="cerrar-sesion"
        onClick={onCerrarSesion}
      >
        Cerrar sesión
      </Button>
    </div>
  );
}
