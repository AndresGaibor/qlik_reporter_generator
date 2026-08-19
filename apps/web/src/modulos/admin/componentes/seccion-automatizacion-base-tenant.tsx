import { Button } from "@/compartido/componentes/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { construirUrlVerAutomatizacionQlik } from "@/compartido/utiles/qlik-urls";
import {
  type TenantQlik,
  type WorkerDiagnostico,
  listarWorkersTenant,
  recrearWorkerTenant,
} from "@/modulos/admin/api";
import { useEffect, useState } from "react";
import {
  nombreVisibleEntornoQlik,
  normalizarHostQlik,
} from "../utiles-presentacion-qlik";
import { ResumenPlantillaBase } from "./resumen-plantilla-base";
import { SeccionConfigurarAutomatizacionBase } from "./seccion-configurar-automatizacion-base";

interface Props {
  organizacionId: string;
  tenantsQlik: TenantQlik[];
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
          Define la plantilla que se usará para crear la automatización personal
          de cada usuario en su primer uso.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {tenantsQlik.map((tenantQlik) => (
          <PlantillaPorEntorno
            key={tenantQlik.id}
            organizacionId={organizacionId}
            tenantQlik={tenantQlik}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PlantillaPorEntorno({
  organizacionId,
  tenantQlik,
}: { organizacionId: string; tenantQlik: TenantQlik }) {
  const configurada = Boolean(tenantQlik.automatizacionBaseIdQlik);
  const [editando, setEditando] = useState(!configurada);
  const nombreEntorno = nombreVisibleEntornoQlik(tenantQlik);
  const hostVisible = normalizarHostQlik(tenantQlik.host);
  const diagnosticoProps = {
    organizacionId,
    tenantQlikId: tenantQlik.id,
    host: tenantQlik.host,
  };

  if (configurada && !editando) {
    return (
      <>
        <ResumenPlantillaBase
          nombre={tenantQlik.automatizacionBaseNombre || "Plantilla base"}
          entorno={nombreEntorno}
          host={hostVisible}
          onCambiar={() => setEditando(true)}
        />
        <DiagnosticoWorkers {...diagnosticoProps} />
      </>
    );
  }

  return (
    <section className="rounded-xl border border-line-200 bg-app/20 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">{nombreEntorno}</p>
          <p className="font-mono text-xs text-ink-500">{hostVisible}</p>
        </div>
        {configurada && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        )}
      </div>
      {!configurada && (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs leading-5 text-brand-800">
          El sistema copiará esta automatización y personalizará la copia sin
          modificar el original.
        </div>
      )}
      <SeccionConfigurarAutomatizacionBase
        organizacionId={organizacionId}
        tenantQlik={tenantQlik}
      />
      <DiagnosticoWorkers {...diagnosticoProps} />
    </section>
  );
}

function DiagnosticoWorkers({
  organizacionId,
  tenantQlikId,
  host,
}: {
  organizacionId: string;
  tenantQlikId: string;
  host: string;
}) {
  const [workers, setWorkers] = useState<WorkerDiagnostico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recreandoId, setRecreandoId] = useState<string | null>(null);
  useEffect(() => {
    let activo = true;
    listarWorkersTenant(organizacionId, tenantQlikId)
      .then((resultado) => activo && setWorkers(resultado))
      .catch(() => undefined)
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [organizacionId, tenantQlikId]);
  if (!cargando && workers.length === 0) return null;
  return (
    <div className="rounded-lg border border-line-200 bg-surface p-3">
      <p className="mb-2 text-xs font-semibold text-ink-800">
        Workers personales
      </p>
      {cargando ? (
        <p className="text-xs text-ink-500">Cargando diagnóstico…</p>
      ) : (
        <div className="space-y-2">
          {workers.map((worker) => {
            const problem = worker.estado !== "activo";
            return (
              <div
                key={worker.id}
                className="flex flex-col gap-2 rounded-md bg-app/40 p-2 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    {worker.usuarioNombre ?? worker.usuarioId}
                  </p>
                  <p className="truncate text-ink-500">
                    {worker.usuarioNombreQlik ?? "Sin identidad Qlik"} ·{" "}
                    {worker.usuarioIdQlik ?? "sin ID"}
                  </p>
                  {problem && (
                    <p className="text-danger-600">
                      {worker.mensajeError ?? "Worker requiere atención"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 font-semibold ${problem ? "bg-red-50 text-danger-600" : "bg-brand-50 text-brand-700"}`}
                  >
                    {worker.estado}
                  </span>
                  <a
                    className="text-brand-600 hover:underline"
                    href={construirUrlVerAutomatizacionQlik(
                      host,
                      worker.automatizacionIdQlik,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver en Qlik
                  </a>
                  {problem && (
                    <button
                      type="button"
                      className="font-semibold text-brand-600 hover:underline disabled:opacity-50"
                      disabled={recreandoId === worker.id}
                      onClick={async () => {
                        setRecreandoId(worker.id);
                        try {
                          const actualizado = await recrearWorkerTenant(
                            organizacionId,
                            tenantQlikId,
                            worker.id,
                          );
                          setWorkers((actuales) =>
                            actuales.map((actual) =>
                              actual.id === actualizado.id
                                ? actualizado
                                : actual,
                            ),
                          );
                        } finally {
                          setRecreandoId(null);
                        }
                      }}
                    >
                      Recrear desde plantilla
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
