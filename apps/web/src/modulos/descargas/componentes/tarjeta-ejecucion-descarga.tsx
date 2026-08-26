import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenDescargaEjecucion } from "@qlik/contratos/descargas";
import { useState } from "react";
import {
  formatearDuracion,
  formatearFechaISO,
  formatearTamano,
  presentarEjecucion,
} from "../presentacion-ejecucion";
import type { EstadoDescarga } from "../use-descarga-ejecucion";
import { DescargaEjecucion } from "./descarga-ejecucion";

function formatearDuracionMs(ms: number): string {
  const segundos = Math.floor(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  if (minutos === 0) return `${resto} s`;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}

interface TarjetaEjecucionDescargaProps {
  ejecucion: ResumenDescargaEjecucion;
  estadoDescarga: EstadoDescarga;
  progreso: number;
  porcentaje: number;
  bytesDescargados: number;
  totalBytes: number;
  totalArchivos: number;
  archivoActual: string;
  error: string | null;
  onDescargar: () => void;
  onDescargarArchivo: (nombre: string) => void;
  onCancelar: () => void;
}

export function TarjetaEjecucionDescarga({
  ejecucion,
  estadoDescarga,
  progreso,
  porcentaje,
  bytesDescargados,
  totalBytes,
  totalArchivos,
  archivoActual,
  error,
  onDescargar,
  onCancelar,
}: TarjetaEjecucionDescargaProps) {
  const [mostrarTecnico, setMostrarTecnico] = useState(false);
  const presentacion = presentarEjecucion(ejecucion);
  const archivos = ejecucion.archivos ?? [];
  const totalTamano = archivos.reduce(
    (total, archivo) => total + archivo.tamano,
    0,
  );
  const duracion = formatearDuracion(
    ejecucion.creadoEn,
    ejecucion.finalizadoEn,
  );
  const disponible = presentacion.tipo === "completada" && archivos.length > 0;
  const tieneBigQuery =
    ejecucion.duracionBigQueryMs != null ||
    ejecucion.jobIdBigQuery ||
    ejecucion.runIdQlik ||
    ejecucion.ejecucionId;
  return (
    <Card className="overflow-hidden border-line-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base font-semibold">
            {ejecucion.reporteNombre}
          </CardTitle>
          <p className="mt-1 text-xs text-ink-400">
            {formatearFechaISO(ejecucion.creadoEn)}
          </p>
        </div>
        <EstadoBadge estado={presentacion} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {presentacion.tipo === "preparando" ||
        presentacion.tipo === "iniciada" ? (
          <div className="rounded-lg bg-brand-50/70 px-3 py-2.5 text-sm text-ink-600">
            <div className="flex items-center gap-2 font-medium text-brand-700">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
              En proceso
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Archivos todavía no disponibles.
            </p>
          </div>
        ) : null}

        {presentacion.tipo === "completada" && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-line-200 bg-surface-subtle px-3 py-2">
                <p className="text-ink-400">Resultado</p>
                <p className="mt-1 font-semibold text-ink-800">
                  {archivos.length}{" "}
                  {archivos.length === 1 ? "archivo" : "archivos"}
                  {archivos.length > 0
                    ? ` · ${formatearTamano(totalTamano)}`
                    : ""}
                </p>
              </div>
              <div className="rounded-lg border border-line-200 bg-surface-subtle px-3 py-2">
                <p className="text-ink-400">Duración</p>
                <p className="mt-1 font-semibold text-ink-800">
                  {duracion ?? "—"}
                </p>
              </div>
              {ejecucion.duracionBigQueryMs != null && (
                <div className="rounded-lg border border-line-200 bg-surface-subtle px-3 py-2">
                  <p className="text-ink-400">BQ</p>
                  <p className="mt-1 font-semibold text-ink-800">
                    {formatearDuracionMs(ejecucion.duracionBigQueryMs)}
                  </p>
                </div>
              )}
              {ejecucion.totalBytesProcessed && (
                <div className="rounded-lg border border-line-200 bg-surface-subtle px-3 py-2">
                  <p className="text-ink-400">Procesado</p>
                  <p className="mt-1 font-semibold text-ink-800">
                    {formatearTamano(Number(ejecucion.totalBytesProcessed))}
                  </p>
                </div>
              )}
            </div>
            {tieneBigQuery && (
              <div>
                <button
                  type="button"
                  onClick={() => setMostrarTecnico((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-700"
                >
                  <Icon
                    name="chev"
                    size="sm"
                    className={`transition-transform ${mostrarTecnico ? "rotate-90" : "-rotate-180"}`}
                  />
                  Detalles técnicos
                </button>
                {mostrarTecnico && (
                  <div className="mt-2 space-y-2 rounded-lg border border-line-200 bg-surface-subtle p-3">
                    {ejecucion.ejecucionId && (
                      <LineaTecnicaCopy
                        etiqueta="Ejecución"
                        valor={ejecucion.ejecucionId}
                      />
                    )}
                    {ejecucion.jobIdBigQuery && (
                      <LineaTecnicaCopy
                        etiqueta="Job BQ"
                        valor={ejecucion.jobIdBigQuery}
                      />
                    )}
                    {ejecucion.runIdQlik && (
                      <LineaTecnicaCopy
                        etiqueta="Run Qlik"
                        valor={ejecucion.runIdQlik}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {presentacion.tipo === "error" && (
          <div className="rounded-lg bg-danger-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-danger-700">
              La ejecución terminó con error
            </p>
            {presentacion.mensaje && (
              <p className="mt-1 text-xs text-danger-600">
                {presentacion.mensaje}
              </p>
            )}
          </div>
        )}

        {presentacion.tipo === "detenida" && (
          <div className="rounded-lg bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
            La ejecución fue detenida y no generará nuevos archivos.
          </div>
        )}
        {disponible && (
          <DescargaEjecucion
            estado={estadoDescarga}
            progreso={progreso}
            porcentaje={porcentaje}
            bytesDescargados={bytesDescargados}
            totalBytes={totalBytes}
            totalArchivos={totalArchivos}
            archivoActual={archivoActual}
            error={error}
            onDescargar={onDescargar}
            onCancelar={onCancelar}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LineaTecnicaCopy({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-ink-500">
        {etiqueta}:{" "}
        <span className="font-mono text-xs text-ink-700">{valor}</span>
      </span>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(valor)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-ink-500 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`Copiar ${etiqueta}`}
      >
        <Icon name="copy" size="sm" />
        Copiar
      </button>
    </div>
  );
}

function EstadoBadge({
  estado,
}: {
  estado: ReturnType<typeof presentarEjecucion>;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold";
  switch (estado.tipo) {
    case "preparando":
    case "iniciada":
      return (
        <span className={`${base} bg-brand-50 text-brand-700`}>En proceso</span>
      );
    case "completada":
      return (
        <span className={`${base} bg-success-50 text-success-700`}>
          <Icon name="check" size="sm" /> Completada
        </span>
      );
    case "error":
      return (
        <span className={`${base} bg-danger-50 text-danger-700`}>Error</span>
      );
    case "detenida":
      return (
        <span className={`${base} bg-warning-50 text-warning-700`}>
          <Icon name="pause" size="sm" /> Detenida
        </span>
      );
  }
}
