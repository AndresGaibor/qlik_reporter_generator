import { Button } from "@/compartido/componentes/ui/button";
import { construirUrlVerFlujoQlik } from "@/compartido/utiles/qlik-urls";
import { crearReporteDesdePlantilla } from "@/modulos/reportes/api";
import { useState } from "react";

interface Props {
  abierto: boolean;
  nombrePlantilla: string;
  host: string;
  onCerrar: () => void;
  onCreado: () => void;
}

export function ModalCrearReporteDesdePlantilla({
  abierto,
  nombrePlantilla,
  host,
  onCerrar,
  onCreado,
}: Props) {
  const [nombre, setNombre] = useState(`Copia de ${nombrePlantilla}`);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string>();
  if (!abierto) return null;

  const cerrar = () => {
    if (creando) return;
    setError(undefined);
    setNombre(`Copia de ${nombrePlantilla}`);
    onCerrar();
  };
  const crear = async () => {
    const ventanaQlik = window.open("about:blank", "_blank");
    if (ventanaQlik) ventanaQlik.opener = null;
    setCreando(true);
    setError(undefined);
    try {
      const resultado = await crearReporteDesdePlantilla(nombre.trim());
      const urlQlik = construirUrlVerFlujoQlik(host, resultado.id);
      if (ventanaQlik) ventanaQlik.location.href = urlQlik;
      else window.location.assign(urlQlik);
      onCreado();
      onCerrar();
    } catch (causa) {
      ventanaQlik?.close();
      setError(
        causa instanceof Error ? causa.message : "No se pudo crear el reporte",
      );
    } finally {
      setCreando(false);
    }
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-ink-950/50 p-4"
      aria-labelledby="titulo-crear-reporte"
    >
      <div className="w-full max-w-lg rounded-xl border border-line-200 bg-surface p-5 shadow-xl">
        <h2
          id="titulo-crear-reporte"
          className="font-display text-lg font-semibold text-ink-900"
        >
          Crear reporte
        </h2>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-ink-600">
            Se creará un reporte desde la plantilla{" "}
            <strong>{nombrePlantilla}</strong>.
          </p>
          <div>
            <label
              htmlFor="nombre-copia-dataflow"
              className="text-sm font-semibold text-ink-800"
            >
              Nombre del reporte
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
              {creando ? "Creando reporte…" : "Crear reporte"}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
