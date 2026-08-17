import { Button } from "@/compartido/componentes/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { ConfirmDialog } from "@/compartido/componentes/ui/confirm-dialog";
import { Icon } from "@/compartido/componentes/ui/icon";
import { useState } from "react";
import type { DetalleTenant } from "../api";
import {
  FilaUsuario,
  TarjetaUsuario,
  type UsuarioTenant,
} from "./elementos-usuario-tabla";
import { ModalAgregarUsuario } from "./modal-agregar-usuario";
import {
  puedeCambiarRolUsuario,
  puedeQuitarUsuario,
} from "./usuarios-permisos";

interface Props {
  usuarios: UsuarioTenant[];
  onActualizarRol: (params: {
    usuarioId: string;
    rol: "admin" | "usuario";
  }) => void;
  onEliminarUsuario: (usuarioId: string) => void;
  onAbrirModalAgregar: () => void;
  modalAgregar: {
    open: boolean;
    onClose: () => void;
    onAgregar: (correo: string, rol: "admin" | "usuario") => void;
    isPending: boolean;
  };
  actualizar: { isPending: boolean };
  eliminar: { isPending: boolean };
}

export function SeccionUsuarios({
  usuarios,
  onActualizarRol,
  onEliminarUsuario,
  onAbrirModalAgregar,
  modalAgregar,
  actualizar,
  eliminar,
}: Props) {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    titulo: string;
    mensaje: string;
    onConfirm: () => void;
  }>({
    open: false,
    titulo: "Confirmar cambio",
    mensaje: "",
    onConfirm: () => {},
  });

  const solicitarRol = (usuario: UsuarioTenant, rol: "admin" | "usuario") => {
    if (!puedeCambiarRolUsuario(usuario, rol, usuarios)) return;
    if (usuario.rol === "admin" && rol === "usuario") {
      setConfirmDialog({
        open: true,
        titulo: "Retirar permisos de administrador",
        mensaje: `¿Cambiar a "${usuario.nombre}" a Usuario final? Dejará de administrar configuraciones y usuarios.`,
        onConfirm: () => onActualizarRol({ usuarioId: usuario.id, rol }),
      });
      return;
    }
    onActualizarRol({ usuarioId: usuario.id, rol });
  };

  const solicitarQuitar = (usuario: UsuarioTenant) => {
    if (!puedeQuitarUsuario(usuario, usuarios)) return;
    setConfirmDialog({
      open: true,
      titulo: "Quitar acceso al usuario",
      mensaje: `¿Quitar el acceso a "${usuario.nombre}" (${usuario.correo})? Esta persona dejará de poder iniciar sesión.`,
      onConfirm: () => onEliminarUsuario(usuario.id),
    });
  };

  return (
    <>
      <Card className="border-line-200 bg-surface shadow-card">
        <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
                <Icon name="users" className="text-brand-600" /> Usuarios y
                permisos
              </CardTitle>
              <p className="mt-1 text-xs text-ink-500">
                {usuarios.length}{" "}
                {usuarios.length === 1
                  ? "usuario autorizado"
                  : "usuarios autorizados"}{" "}
                en la plataforma.
              </p>
            </div>
            <Button
              size="sm"
              onClick={onAbrirModalAgregar}
              className="shrink-0 gap-1.5 sm:self-auto"
            >
              <Icon name="plus" size="sm" /> Autorizar usuario
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {usuarios.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-ink-700">
                No hay usuarios autorizados
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Autoriza al menos un administrador para gestionar la plataforma.
              </p>
            </div>
          ) : usuarios.length === 1 ? (
            <div className="p-4">
              <div className="overflow-hidden rounded-lg border border-line-200 bg-app/20">
                <TarjetaUsuario
                  usuario={usuarios[0]}
                  usuarios={usuarios}
                  ocupado={actualizar.isPending || eliminar.isPending}
                  onRol={solicitarRol}
                  onQuitar={solicitarQuitar}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line-200 bg-app/60 text-xs font-semibold uppercase tracking-wider text-ink-500">
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Correo electrónico</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-200">
                    {usuarios.map((usuario) => (
                      <FilaUsuario
                        key={usuario.id}
                        usuario={usuario}
                        usuarios={usuarios}
                        ocupado={actualizar.isPending || eliminar.isPending}
                        onRol={solicitarRol}
                        onQuitar={solicitarQuitar}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-line-200 md:hidden">
                {usuarios.map((usuario) => (
                  <TarjetaUsuario
                    key={usuario.id}
                    usuario={usuario}
                    usuarios={usuarios}
                    ocupado={actualizar.isPending || eliminar.isPending}
                    onRol={solicitarRol}
                    onQuitar={solicitarQuitar}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ModalAgregarUsuario
        open={modalAgregar.open}
        onClose={modalAgregar.onClose}
        onAgregar={modalAgregar.onAgregar}
        isPending={modalAgregar.isPending}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        onCancel={() =>
          setConfirmDialog((actual) => ({ ...actual, open: false }))
        }
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((actual) => ({ ...actual, open: false }));
        }}
        titulo={confirmDialog.titulo}
        mensaje={confirmDialog.mensaje}
      />
    </>
  );
}
