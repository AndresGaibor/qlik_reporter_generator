import { Button } from "@/compartido/componentes/ui/button";

export function ModalConfirmacionRiesgo({
  abierto,
  onVolver,
  onConfirmar,
}: {
  abierto: boolean;
  onVolver: () => void;
  onConfirmar: () => void;
}) {
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4"
      role="presentation"
    >
      <dialog
        open
        aria-labelledby="titulo-riesgo-ejecucion"
        className="w-full max-w-md rounded-xl border border-amber-200 bg-surface p-6 shadow-xl"
      >
        <h2
          id="titulo-riesgo-ejecucion"
          className="text-lg font-semibold text-ink-900"
        >
          Este reporte puede tardar bastante
        </h2>
        <p className="mt-3 text-sm text-ink-700">
          La configuración del reporte puede generar una cantidad muy grande de
          información. Esto puede aumentar el tiempo de procesamiento y el uso
          de recursos.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onVolver}>
            Volver
          </Button>
          <Button size="sm" onClick={onConfirmar}>
            Ejecutar de todas formas
          </Button>
        </div>
      </dialog>
    </div>
  );
}
