import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ConfiguracionBigQuery } from "../api";
import {
  type analizarCredencialesBigQuery,
  construirUriGcs,
  separarUriGcs,
} from "./bigquery-formulario";
import { DatoResumen } from "./dato-resumen";

export function FormularioBigQuery({
  configuracion,
  dataset,
  gcsUri,
  maximoFilasPorArchivo,
  credencialesJson,
  analisis,
  habilitado,
  guardando,
  mostrarCancelar,
  onDataset,
  onGcsUri,
  onMaximoFilasPorArchivo,
  onCredenciales,
  onCancelar,
  onGuardar,
  onGuardarYProbar,
}: {
  configuracion?: ConfiguracionBigQuery;
  dataset: string;
  gcsUri: string;
  maximoFilasPorArchivo: number;
  credencialesJson: string;
  analisis?: ReturnType<typeof analizarCredencialesBigQuery>;
  habilitado: boolean;
  guardando: boolean;
  mostrarCancelar: boolean;
  onDataset: (v: string) => void;
  onGcsUri: (v: string) => void;
  onMaximoFilasPorArchivo: (v: number) => void;
  onCredenciales: (v: string) => void;
  onCancelar: () => void;
  onGuardar: () => void;
  onGuardarYProbar: () => void;
}) {
  return (
    <div className="space-y-5">
      {(analisis?.valido || configuracion?.projectId) && (
        <div className="grid gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:grid-cols-2">
          <DatoResumen
            etiqueta="Proyecto detectado"
            valor={analisis?.projectId ?? configuracion?.projectId ?? "—"}
          />
          <DatoResumen
            etiqueta="Cuenta detectada"
            valor={analisis?.clientEmail ?? configuracion?.clientEmail ?? "—"}
          />
        </div>
      )}
      <div className="rounded-xl border border-line-200 bg-surface-subtle p-4">
        <p className="text-xs font-semibold text-ink-800">
          Almacenamiento de reportes
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <CampoGcs
            id="gcs-bucket"
            etiqueta="Bucket"
            valor={separarUriGcs(gcsUri).bucket}
            placeholder="bkt_dwh"
            onChange={(bucket) =>
              onGcsUri(construirUriGcs(bucket, separarUriGcs(gcsUri).prefijo))
            }
          />
          <CampoGcs
            id="gcs-prefijo"
            etiqueta="Carpeta / prefijo"
            valor={separarUriGcs(gcsUri).prefijo}
            placeholder="POCs/TalendDescargados/"
            onChange={(prefijo) =>
              onGcsUri(construirUriGcs(separarUriGcs(gcsUri).bucket, prefijo))
            }
          />
        </div>
        <p className="mt-3 text-[11px] text-ink-500">
          Ruta resultante: <span className="font-mono">{gcsUri}</span>
        </p>
        <div className="mt-4 max-w-sm">
          <label
            htmlFor="bigquery-max-rows"
            className="block text-xs font-semibold text-ink-700"
          >
            Filas máximas por CSV descargado
          </label>
          <input
            id="bigquery-max-rows"
            type="number"
            min={1}
            max={1_000_000}
            step={1}
            value={maximoFilasPorArchivo}
            onChange={(e) => {
              const valor = Number(e.target.value);
              if (Number.isInteger(valor) && valor >= 1 && valor <= 1_000_000)
                onMaximoFilasPorArchivo(valor);
            }}
            className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            La app repartirá los CSV al descargar; BigQuery no contará ni numerará filas para este límite.
          </p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <label
            htmlFor="bigquery-dataset"
            className="block text-xs font-semibold text-ink-700"
          >
            Dataset <span className="text-danger-600">*</span>
          </label>
          <input
            id="bigquery-dataset"
            value={dataset}
            onChange={(e) => onDataset(e.target.value)}
            placeholder="ej: demo_lafavorita"
            className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            Usa el ID exacto del dataset.
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="bigquery-credenciales"
              className="block text-xs font-semibold text-ink-700"
            >
              JSON de la cuenta de servicio
              {!configuracion?.credencialesConfiguradas && (
                <span className="text-danger-600"> *</span>
              )}
            </label>
            <label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">
              Seleccionar archivo JSON
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) onCredenciales(await archivo.text());
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <textarea
            id="bigquery-credenciales"
            rows={8}
            spellCheck={false}
            value={credencialesJson}
            onChange={(e) => onCredenciales(e.target.value)}
            placeholder={
              configuracion?.credencialesConfiguradas
                ? "Pega un JSON solo para reemplazar la cuenta actual"
                : "Pega aquí el JSON completo de la cuenta de servicio"
            }
            className="mt-1 w-full resize-y rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-xs leading-5 text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            {configuracion?.credencialesConfiguradas
              ? "Déjalo vacío para conservar las credenciales protegidas actuales."
              : "El JSON se cifra y la clave privada no vuelve a mostrarse."}
          </p>
          {analisis && !analisis.valido && (
            <p className="mt-2 text-xs text-danger-600">{analisis.error}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line-200 pt-5 sm:flex-row sm:justify-end">
        {mostrarCancelar && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancelar}
            disabled={guardando}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onGuardar}
          disabled={!habilitado || guardando}
        >
          Guardar sin probar
        </Button>
        <Button
          type="button"
          onClick={onGuardarYProbar}
          disabled={!habilitado || guardando}
          className="gap-1.5"
        >
          <Icon name="check" size="sm" />
          {guardando ? "Guardando…" : "Guardar y verificar"}
        </Button>
      </div>
    </div>
  );
}

function CampoGcs({
  id,
  etiqueta,
  valor,
  placeholder,
  onChange,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  placeholder: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-ink-700">
        {etiqueta} <span className="text-danger-600">*</span>
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
