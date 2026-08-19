import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { ResumenAutomatizacion } from "@/modulos/reportes/api";
import { Link } from "@tanstack/react-router";
import type { ResumenFlujo } from "../../api";

export function PestanaAutomatizacionFlujo({
  flujo,
  automatizacionVinculada,
}: {
  flujo: ResumenFlujo;
  automatizacionVinculada?: ResumenAutomatizacion;
}) {
  return (
    <div className="space-y-4">
      {automatizacionVinculada ? (
        <div className="p-5 bg-white rounded-xl border border-emerald-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="font-semibold text-sm text-gray-900">
                Este Dataflow ya tiene una automatización activa en Qlik
                Automate
              </h4>
            </div>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
            >
              <Link
                to="/reportes/$id"
                params={{ id: automatizacionVinculada.id }}
              >
                Ver automatización completa
              </Link>
            </Button>
          </div>
          <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 text-xs space-y-1">
            <p className="font-semibold text-emerald-900">
              {automatizacionVinculada.nombre}
            </p>
            <p className="text-emerald-700 font-mono">
              ID Automate: {automatizacionVinculada.id}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-8 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-3">
          <Icon name="robot" size="lg" className="mx-auto text-slate-400" />
          <h4 className="font-semibold text-sm text-slate-800">
            Este Dataflow todavía no tiene una automatización
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Créala en Qlik Automate para que la extracción y carga hacia el
            destino ocurran solas, sin que tengas que hacerlo manualmente.
          </p>
          <Button
            asChild
            size="sm"
            className="bg-brand-600 hover:bg-brand-700 text-white gap-1.5 text-xs"
          >
            <Link to="/reportes">
              <Icon name="zap" size="sm" />
              Crear automatización en Qlik Automate
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
