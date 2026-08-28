import { Button } from "./button";

export interface UsuarioParaCompartir {
  id: string;
  nombre: string;
  correo: string | null;
}

export function ModalCompartir({
  titulo,
  usuarios,
  todaOrganizacion,
  seleccionados,
  cargando,
  guardando,
  onTodaOrganizacion,
  onSeleccionados,
  onCerrar,
  onGuardar,
}: {
  titulo: string;
  usuarios: UsuarioParaCompartir[];
  todaOrganizacion: boolean;
  seleccionados: string[];
  cargando: boolean;
  guardando: boolean;
  onTodaOrganizacion: (valor: boolean) => void;
  onSeleccionados: (usuarios: string[]) => void;
  onCerrar: () => void;
  onGuardar: () => void;
}) {
  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none place-items-center border-0 bg-black/40 p-4 open:grid"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {titulo}
        </h2>
        <label className="mt-4 flex items-center gap-3 rounded-lg border border-line-200 p-3">
          <input
            type="checkbox"
            checked={todaOrganizacion}
            onChange={(e) => onTodaOrganizacion(e.target.checked)}
          />
          <span>Todas las personas de la organización</span>
        </label>
        {!todaOrganizacion && (
          <div className="mt-3 space-y-2">
            {usuarios.map((usuario) => (
              <label
                key={usuario.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-hover"
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(usuario.id)}
                  onChange={(e) =>
                    onSeleccionados(
                      e.target.checked
                        ? [...seleccionados, usuario.id]
                        : seleccionados.filter((id) => id !== usuario.id),
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
          <Button onClick={onGuardar} disabled={cargando || guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
