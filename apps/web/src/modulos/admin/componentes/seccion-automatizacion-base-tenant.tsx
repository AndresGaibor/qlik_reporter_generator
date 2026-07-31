import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { TenantQlik } from "@/modulos/admin/api";
import { SeccionConfigurarAutomatizacionBase } from "./seccion-configurar-automatizacion-base";

interface Props {
  organizacionId: string;
  tenantsQlik: TenantQlik[];
}

function EstadoPlantilla({ lista }: { lista: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        lista
          ? "border-brand-100 bg-brand-50 text-brand-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          lista ? "bg-brand-600" : "bg-amber-500 animate-pulse"
        }`}
      />
      {lista ? "Configurada" : "Pendiente"}
    </span>
  );
}

export function SeccionAutomatizacionBaseTenant({
  organizacionId,
  tenantsQlik,
}: Props) {
  if (tenantsQlik.length === 0) return null;

  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon name="robot" className="text-brand-600" />
          Plantilla base de automatizaciones
        </CardTitle>
        <p className="mt-1 text-xs text-ink-500">
          Selecciona la automatización de Qlik Automate que se clonará al crear
          un reporte nuevo.
        </p>
      </CardHeader>

      <div className="mx-6 mt-5 flex gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
          <Icon name="sparkles" className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-900">
            ¿Para qué sirve?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-brand-800">
            Funciona como un molde. El sistema crea una copia y la personaliza
            con la información del reporte, sin modificar la automatización
            original.
          </p>
        </div>
      </div>

      <CardContent className="space-y-5 pt-6">
        {tenantsQlik.map((tenantQlik, indice) => {
          const tienePlantilla = Boolean(tenantQlik.automatizacionBaseIdQlik);

          return (
            <section
              key={tenantQlik.id}
              className="overflow-hidden rounded-xl border border-line-200 bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-200 bg-app/40 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-obj-50 text-sm font-bold text-obj-600">
                    Q{indice + 1}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {tenantQlik.nombre || "Entorno Qlik Cloud"}
                    </span>
                    <span className="block truncate font-mono text-xs text-ink-500">
                      {tenantQlik.host}
                    </span>
                  </div>
                </div>
                <EstadoPlantilla lista={tienePlantilla} />
              </div>

              <div className="space-y-4 p-5">
                {tenantQlik.automatizacionBaseNombre && (
                  <div className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
                    <Icon
                      name="star"
                      size="sm"
                      className="mt-0.5 shrink-0 text-brand-600"
                    />
                    <div className="min-w-0">
                      <span className="block text-xs text-ink-500">
                        Plantilla activa
                      </span>
                      <span className="block truncate text-sm font-bold text-brand-800">
                        {tenantQlik.automatizacionBaseNombre}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-400">
                        ID: {tenantQlik.automatizacionBaseIdQlik}
                      </span>
                    </div>
                  </div>
                )}

                <SeccionConfigurarAutomatizacionBase
                  organizacionId={organizacionId}
                  tenantQlik={tenantQlik}
                />
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
