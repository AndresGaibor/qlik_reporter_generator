import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ConfiguracionBigQuery } from "../api";
import { DatoResumen } from "./dato-resumen";

export function ResumenConexionBigQuery({
  configuracion,
  probando,
  onEditar,
  onProbar,
}: {
  configuracion: ConfiguracionBigQuery;
  probando: boolean;
  onEditar: () => void;
  onProbar: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <DatoResumen
          etiqueta="Proyecto"
          valor={configuracion.projectId ?? "—"}
        />
        <DatoResumen etiqueta="Dataset" valor={configuracion.dataset ?? "—"} />
        <DatoResumen
          etiqueta="Máx. filas / CSV"
          valor={(configuracion.maximoFilasPorArchivo ?? 1_000_000).toLocaleString("es-EC")}
        />
        <DatoResumen
          etiqueta="Cuenta de servicio"
          valor={configuracion.clientEmail ?? "—"}
        />
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Seguridad
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            <Icon name="check" size="sm" /> Credenciales protegidas
          </span>
        </div>
      </div>
      {configuracion.mensajeError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Último error: {configuracion.mensajeError}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onEditar}>
          Editar configuración
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onProbar}
          disabled={probando}
          className="gap-1.5"
        >
          <Icon name="play" size="sm" />
          {probando ? "Probando…" : "Probar conexión"}
        </Button>
      </div>
    </div>
  );
}
