import { ErrorClienteApi } from "@/compartido/api/cliente";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { SelectBuscable } from "@/compartido/componentes/ui/select-buscable";
import type { TenantQlik } from "@/modulos/admin/api";
import { listarAutomatizacionesParaAdmin } from "@/modulos/admin/api";
import { configurarAutomatizacionBaseTenant } from "@/modulos/admin/api";
import type { ResumenAutomatizacion } from "@qlik/contratos/automatizaciones";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Props {
  organizacionId: string;
  tenantQlik: TenantQlik;
}

export function SeccionConfigurarAutomatizacionBase({
  organizacionId,
  tenantQlik,
}: Props) {
  const { mostrarExito, mostrarError } = useNotificaciones();
  const queryClient = useQueryClient();
  const [baseIdSeleccionado, setBaseIdSeleccionado] = useState(
    tenantQlik.automatizacionBaseIdQlik || "",
  );
  const [modoManual, setModoManual] = useState(false);
  const [idManual, setIdManual] = useState(
    tenantQlik.automatizacionBaseIdQlik || "",
  );
  const [nombreManual, setNombreManual] = useState(
    tenantQlik.automatizacionBaseNombre || "",
  );
  const [validacion, setValidacion] = useState<"validada" | string | null>(
    null,
  );

  const { data: automatizaciones = [], isLoading } = useQuery<
    ResumenAutomatizacion[]
  >({
    queryKey: ["automatizaciones-admin-list", tenantQlik.id],
    queryFn: listarAutomatizacionesParaAdmin,
  });

  const guardarBase = useMutation({
    mutationFn: (auto: { id: string; nombre?: string }) =>
      configurarAutomatizacionBaseTenant(
        organizacionId,
        tenantQlik.id,
        auto.id,
        auto.nombre,
      ),
    onSuccess: () => {
      setValidacion("validada");
      queryClient.invalidateQueries({
        queryKey: ["admin-tenants-qlik", organizacionId],
      });
      mostrarExito("Plantilla base del tenant configurada");
    },
    onError: (err: Error) => {
      const detalle =
        err instanceof ErrorClienteApi &&
        typeof err.detalles === "object" &&
        err.detalles !== null
          ? String((err.detalles as { razon?: unknown }).razon ?? "")
          : "";
      setValidacion(detalle || err.message);
      mostrarError(err.message);
    },
  });

  const opcionesBase = automatizaciones.map((a) => ({
    id: a.id,
    nombre: `${a.nombre} (ID: ${a.id.slice(0, 8)}…)`,
    espacioNombre: a.espacioNombre || "Personal",
  }));

  const existeBaseEnOpciones = opcionesBase.some(
    (o) => o.id === tenantQlik.automatizacionBaseIdQlik,
  );

  const opciones =
    tenantQlik.automatizacionBaseIdQlik && !existeBaseEnOpciones
      ? [
          {
            id: tenantQlik.automatizacionBaseIdQlik,
            nombre: `${tenantQlik.automatizacionBaseNombre || "Plantilla base"} (ID: ${tenantQlik.automatizacionBaseIdQlik.slice(0, 8)}…)`,
            espacioNombre: "Plantilla activa actual",
          },
          ...opcionesBase,
        ]
      : opcionesBase;

  const handleSeleccionar = (id: string) => {
    setBaseIdSeleccionado(id);
    const autoEncontrada = automatizaciones.find((a) => a.id === id);
    const nombre =
      autoEncontrada?.nombre ??
      tenantQlik.automatizacionBaseNombre ??
      "Plantilla base";
    guardarBase.mutate({ id, nombre });
  };

  const handleGuardarManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!idManual.trim()) return;
    guardarBase.mutate({
      id: idManual.trim(),
      nombre: nombreManual.trim() || undefined,
    });
  };

  return (
    <div className="space-y-3">
      {validacion && (
        <div
          className={`rounded-lg border p-3 text-xs ${validacion === "validada" ? "border-brand-100 bg-brand-50 text-brand-800" : "border-red-100 bg-red-50 text-danger-600"}`}
        >
          {validacion === "validada"
            ? "Contrato de plantilla validado correctamente."
            : `La plantilla no es compatible: ${validacion}`}
        </div>
      )}
      {!modoManual ? (
        <>
          <SelectBuscable
            placeholder="Busca y selecciona la automatización plantilla…"
            searchPlaceholder="Escribe el nombre para filtrar…"
            emptyText="No encontramos automatizaciones en la API. Puedes ingresar el ID manualmente abajo."
            opciones={opciones}
            valorSeleccionado={baseIdSeleccionado}
            onSeleccionar={handleSeleccionar}
            cargando={isLoading}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModoManual(true)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline"
            >
              ¿No ves tu automatización? Ingresar ID de Qlik manualmente →
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={handleGuardarManual}
          className="space-y-3 rounded-lg border border-line-200 bg-app/30 p-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-900">
              Ingreso manual de ID de automatización (Qlik Cloud)
            </span>
            <button
              type="button"
              onClick={() => setModoManual(false)}
              className="text-xs text-ink-400 hover:text-ink-700"
            >
              Volver a la lista
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label
                htmlFor="automatizacion-base-id-manual"
                className="block text-[11px] font-semibold text-ink-700 mb-1"
              >
                ID de automatización Qlik *
              </label>
              <input
                id="automatizacion-base-id-manual"
                type="text"
                required
                value={idManual}
                onChange={(e) => setIdManual(e.target.value)}
                placeholder="Ej. 7c2f9b27-3ba3-435f-9059-b875adfc1d9a"
                className="w-full rounded-md border border-line-200 bg-surface px-3 py-1.5 font-mono text-xs text-ink-900"
              />
            </div>
            <div>
              <label
                htmlFor="automatizacion-base-nombre-manual"
                className="block text-[11px] font-semibold text-ink-700 mb-1"
              >
                Nombre descriptivo (opcional)
              </label>
              <input
                id="automatizacion-base-nombre-manual"
                type="text"
                value={nombreManual}
                onChange={(e) => setNombreManual(e.target.value)}
                placeholder="Ej. ELT - Test"
                className="w-full rounded-md border border-line-200 bg-surface px-3 py-1.5 text-xs text-ink-900"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={guardarBase.isPending || !idManual.trim()}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {guardarBase.isPending ? "Guardando..." : "Guardar ID"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
