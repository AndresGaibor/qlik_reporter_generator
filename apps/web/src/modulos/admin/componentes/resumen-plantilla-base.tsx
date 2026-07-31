import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";

interface Props {
  nombre: string;
  entorno: string;
  host: string;
  onCambiar: () => void;
}

export function ResumenPlantillaBase({
  nombre,
  entorno,
  host,
  onCambiar,
}: Props) {
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Icon name="star" size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-500">Plantilla activa</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink-900">
              {nombre}
            </p>
            <p className="mt-1 truncate text-xs text-ink-500">
              {entorno} · <span className="font-mono">{host}</span>
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCambiar}>
          Cambiar plantilla
        </Button>
      </div>
    </div>
  );
}
