import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { DetalleTenant } from "../api";
import {
  puedeCambiarRolUsuario,
  puedeQuitarUsuario,
} from "./usuarios-permisos";

export type UsuarioTenant = DetalleTenant["usuarios"][number];

export function SelectorRol({
  usuario,
  usuarios,
  ocupado,
  onRol,
}: {
  usuario: UsuarioTenant;
  usuarios: UsuarioTenant[];
  ocupado: boolean;
  onRol: (usuario: UsuarioTenant, rol: "admin" | "usuario") => void;
}) {
  const ultimoAdmin =
    usuario.rol === "admin" &&
    !puedeCambiarRolUsuario(usuario, "usuario", usuarios);
  return (
    <div>
      <select
        aria-label={`Rol de ${usuario.nombre}`}
        value={usuario.rol}
        disabled={ocupado || ultimoAdmin}
        onChange={(e) => onRol(usuario, e.target.value as "admin" | "usuario")}
        className="min-h-10 rounded-md border border-line-200 bg-surface px-3 py-2 text-xs text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="usuario">Usuario final</option>
        <option value="admin">Administrador</option>
      </select>
      {ultimoAdmin && (
        <p className="mt-1 text-[11px] text-ink-500">Último administrador</p>
      )}
    </div>
  );
}

export function FilaUsuario({
  usuario,
  usuarios,
  ocupado,
  onRol,
  onQuitar,
}: {
  usuario: UsuarioTenant;
  usuarios: UsuarioTenant[];
  ocupado: boolean;
  onRol: (usuario: UsuarioTenant, rol: "admin" | "usuario") => void;
  onQuitar: (usuario: UsuarioTenant) => void;
}) {
  const puedeQuitar = puedeQuitarUsuario(usuario, usuarios);
  return (
    <tr className="transition-colors hover:bg-hover">
      <td className="px-4 py-3 font-medium text-ink-900">{usuario.nombre}</td>
      <td className="px-4 py-3 font-mono text-xs text-ink-600">
        {usuario.correo || "—"}
      </td>
      <td className="px-4 py-3">
        <SelectorRol
          usuario={usuario}
          usuarios={usuarios}
          ocupado={ocupado}
          onRol={onRol}
        />
      </td>
      <td className="px-4 py-3 text-right">
        {puedeQuitar ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={() => onQuitar(usuario)}
            className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
          >
            Quitar acceso
          </Button>
        ) : (
          <span className="text-xs text-ink-400">Sin acciones</span>
        )}
      </td>
    </tr>
  );
}

export function TarjetaUsuario({
  usuario,
  usuarios,
  ocupado,
  onRol,
  onQuitar,
}: {
  usuario: UsuarioTenant;
  usuarios: UsuarioTenant[];
  ocupado: boolean;
  onRol: (usuario: UsuarioTenant, rol: "admin" | "usuario") => void;
  onQuitar: (usuario: UsuarioTenant) => void;
}) {
  const puedeQuitar = puedeQuitarUsuario(usuario, usuarios);
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-semibold text-xs border border-brand-100">
            {usuario.nombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="font-semibold text-sm text-ink-900">
              {usuario.nombre}
            </h4>
            <p className="font-mono text-xs text-ink-500">
              {usuario.correo || "—"}
            </p>
          </div>
        </div>
        {puedeQuitar ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={() => onQuitar(usuario)}
            className="text-danger-600 hover:bg-danger-50 hover:text-danger-700 text-xs"
          >
            <Icon name="x" size="sm" /> Quitar
          </Button>
        ) : null}
      </div>

      <div className="pt-2 border-t border-line-200 flex items-center justify-between">
        <span className="text-xs text-ink-500 font-medium">Rol asignado</span>
        <SelectorRol
          usuario={usuario}
          usuarios={usuarios}
          ocupado={ocupado}
          onRol={onRol}
        />
      </div>
    </article>
  );
}
