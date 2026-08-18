import { Button } from "@/compartido/componentes/ui/button";
import { construirUrlVerFlujoQlik } from "@/compartido/utiles/qlik-urls";
import { clonarDataflowBase } from "@/modulos/flujos/api";
import { useState } from "react";

interface Props {
  abierto: boolean;
  nombrePlantilla: string;
  host: string;
  onCerrar: () => void;
  onCreado: () => void;
}

export function ModalCrearDataflowDesdePlantilla({
  abierto,
  nombrePlantilla,
  host,
  onCerrar,
  onCreado,
}: Props) {
  const [nombre, setNombre] = useState(`Copia de ${nombrePlantilla}`);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string>();
  const [copia, setCopia] = useState<{ id: string; nombre: string }>();
  if (!abierto) return null;

  const cerrar = () => {
    if (creando) return;
    setError(undefined);
    setCopia(undefined);
    setNombre(`Copia de ${nombrePlantilla}`);
    onCerrar();
  };
  const crear = async () => {
    setCreando(true);
    setError(undefined);
    try {
      const resultado = await clonarDataflowBase(nombre.trim());
      setCopia(resultado);
      onCreado();
    } catch (causa) {
      setError(
        causa instanceof Error ? causa.message : "No se pudo crear la copia",
      );
    } finally {
      setCreando(false);
    }
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-ink-950/50 p-4"
      aria-labelledby="titulo-copiar-dataflow"
    >
      <div className="w-full max-w-lg rounded-xl border border-line-200 bg-surface p-5 shadow-xl">
        <h2
          id="titulo-copiar-dataflow"
          className="font-display text-lg font-semibold text-ink-900"
        >
          {copia ? "Copia creada correctamente" : "Crear copia del Dataflow"}
        </h2>
        {copia ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">
                {copia.nombre}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-700">
                ID: {copia.id}
              </p>
            </div>
            <p className="text-sm text-ink-600">
              La copia ya existe. Ahora puedes abrirla y editarla en Qlik.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cerrar}>
                Cerrar
              </Button>
              <Button asChild>
                <a
                  href={construirUrlVerFlujoQlik(host, copia.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir Dataflow en Qlik
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-600">
              Se copiará la plantilla <strong>{nombrePlantilla}</strong>. El
              original no será modificado.
            </p>
            <div>
              <label
                htmlFor="nombre-copia-dataflow"
                className="text-sm font-semibold text-ink-800"
              >
                Nombre de la copia
              </label>
              <input
                id="nombre-copia-dataflow"
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-line-200 px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-semibold">No se pudo crear la copia</p>
                <p className="mt-1">{error}</p>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={creando} onClick={cerrar}>
                Cancelar
              </Button>
              <Button disabled={creando || !nombre.trim()} onClick={crear}>
                {creando ? "Creando copia…" : "Crear copia"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
