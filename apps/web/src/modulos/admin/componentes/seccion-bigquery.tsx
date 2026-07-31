import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ConfiguracionBigQuery } from "../api";
import {
  guardarConfiguracionBigQuery,
  obtenerConfiguracionBigQuery,
  probarConfiguracionBigQuery,
} from "../api";
import {
  analizarCredencialesBigQuery,
  puedeGuardarBigQuery,
} from "./bigquery-formulario";

interface Props {
  organizacionId: string;
  tenantQlikId?: string;
}

const CLAVE_CONSULTA = "admin-bigquery";
export function SeccionBigQuery({ organizacionId, tenantQlikId }: Props) {
  const queryClient = useQueryClient();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const [dataset, setDataset] = useState("");
  const [credencialesJson, setCredencialesJson] = useState("");

  const consulta = useQuery({
    queryKey: [CLAVE_CONSULTA, organizacionId, tenantQlikId],
    queryFn: () =>
      obtenerConfiguracionBigQuery(organizacionId, tenantQlikId ?? ""),
    enabled: Boolean(tenantQlikId),
  });

  useEffect(() => {
    if (consulta.data?.dataset !== undefined) {
      setDataset(consulta.data.dataset);
    }
  }, [consulta.data?.dataset]);

  const analisis = useMemo(
    () =>
      credencialesJson.trim()
        ? analizarCredencialesBigQuery(credencialesJson)
        : undefined,
    [credencialesJson],
  );

  const configuracion = consulta.data;
  const habilitado = puedeGuardarBigQuery({
    dataset,
    credencialesJson,
    credencialesConfiguradas: configuracion?.credencialesConfiguradas ?? false,
  });
  const guardar = useMutation({
    mutationFn: async () => {
      if (!tenantQlikId) throw new Error("Primero configura Qlik Cloud");
      if (!habilitado) {
        throw new Error(
          analisis?.error ??
            "Ingresa un dataset válido y las credenciales requeridas",
        );
      }
      return guardarConfiguracionBigQuery(organizacionId, tenantQlikId, {
        dataset: dataset.trim(),
        ...(credencialesJson.trim()
          ? { credencialesJson: credencialesJson.trim() }
          : {}),
        precioUsdPorTib: 6.25,
      });
    },
    onSuccess: (resultado) => {
      setCredencialesJson("");
      queryClient.setQueryData(
        [CLAVE_CONSULTA, organizacionId, tenantQlikId],
        resultado,
      );
      queryClient.invalidateQueries({ queryKey: ["destinos-conexiones"] });
      mostrarExito("Configuración de BigQuery guardada");
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const probar = useMutation({
    mutationFn: async () => {
      if (!configuracion?.id) throw new Error("Primero guarda BigQuery");
      return probarConfiguracionBigQuery(configuracion.id);
    },
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({
        queryKey: [CLAVE_CONSULTA, organizacionId, tenantQlikId],
      });
      if (resultado.exitoso) mostrarExito(resultado.mensaje);
      else mostrarError(resultado.mensaje);
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  if (!tenantQlikId) {
    return <BigQuerySinTenant />;
  }

  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
              <Icon name="db" className="text-obj-600" />
              BigQuery
            </CardTitle>
            <p className="mt-1 text-xs text-ink-500">
              Configura la cuenta de servicio y el dataset usados por reportes y
              resultados. El JSON se cifra y no vuelve a mostrarse.
            </p>
          </div>
          <EstadoBigQuery configuracion={configuracion} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {consulta.isLoading ? (
          <p className="text-sm text-ink-500">
            Consultando la configuración de BigQuery…
          </p>
        ) : consulta.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo cargar BigQuery. Recarga la página e inténtalo de nuevo.
          </div>
        ) : (
          <>
            <ResumenBigQuery
              configuracion={configuracion}
              projectId={analisis?.projectId}
              clientEmail={analisis?.clientEmail}
            />

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
                  onChange={(evento) => setDataset(evento.target.value)}
                  placeholder="ej: demo_lafavorita"
                  className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Usa el ID exacto del dataset, no su nombre descriptivo.
                </p>
              </div>
              <div>
                <label
                  htmlFor="bigquery-credenciales"
                  className="block text-xs font-semibold text-ink-700"
                >
                  JSON de la cuenta de servicio
                  {!configuracion?.credencialesConfiguradas && (
                    <span className="text-danger-600"> *</span>
                  )}
                </label>
                <textarea
                  id="bigquery-credenciales"
                  rows={9}
                  spellCheck={false}
                  value={credencialesJson}
                  onChange={(evento) =>
                    setCredencialesJson(evento.target.value)
                  }
                  placeholder={`{
  "type": "service_account",
  "project_id": "mi-proyecto",
  "private_key": "-----BEGIN PRIVATE KEY-----...",
  "client_email": "cuenta@mi-proyecto.iam.gserviceaccount.com"
}`}
                  className="mt-1 w-full resize-y rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-xs leading-5 text-ink-900 focus:border-brand-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  {configuracion?.credencialesConfiguradas
                    ? "Déjalo vacío para conservar la cuenta actual. Si pegas otro JSON, la reemplazará."
                    : "Pega el archivo JSON completo descargado desde Google Cloud."}
                </p>
                {analisis && !analisis.valido && (
                  <p className="mt-2 text-xs text-danger-600">
                    {analisis.error}
                  </p>
                )}
              </div>
            </div>
            {configuracion?.mensajeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                Último error: {configuracion.mensajeError}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-line-200 pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!configuracion?.id || probar.isPending}
                onClick={() => probar.mutate()}
                className="gap-1.5"
              >
                <Icon name="play" size="sm" />
                {probar.isPending ? "Probando…" : "Probar conexión"}
              </Button>
              <Button
                type="button"
                disabled={!habilitado || guardar.isPending}
                onClick={() => guardar.mutate()}
                className="gap-1.5"
              >
                <Icon name="check" size="sm" />
                {guardar.isPending ? "Guardando…" : "Guardar BigQuery"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
function BigQuerySinTenant() {
  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon name="db" className="text-obj-600" />
          BigQuery
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Configura primero un entorno Qlik Cloud para asociar BigQuery a la
          plataforma.
        </div>
      </CardContent>
    </Card>
  );
}

function EstadoBigQuery({
  configuracion,
}: {
  configuracion?: ConfiguracionBigQuery;
}) {
  const estado = configuracion?.estado;
  const estilos =
    estado === "activo"
      ? "border-brand-100 bg-brand-50 text-brand-700"
      : estado === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : configuracion?.configurada
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-line-200 bg-surface text-ink-500";
  const texto =
    estado === "activo"
      ? "Conectada"
      : estado === "error"
        ? "Con error"
        : configuracion?.configurada
          ? "Configurada"
          : "Sin configurar";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${estilos}`}
    >
      {texto}
    </span>
  );
}

function ResumenBigQuery({
  configuracion,
  projectId,
  clientEmail,
}: {
  configuracion?: ConfiguracionBigQuery;
  projectId?: string;
  clientEmail?: string;
}) {
  const proyecto = projectId ?? configuracion?.projectId;
  const correo = clientEmail ?? configuracion?.clientEmail;

  if (!proyecto && !correo) {
    return (
      <div className="rounded-lg border border-dashed border-line-300 bg-app/30 p-4 text-sm text-ink-500">
        Pega el JSON de la cuenta de servicio para identificar el proyecto.
      </div>
    );
  }
  return (
    <div className="grid gap-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4 sm:grid-cols-2 xl:grid-cols-3">
      <DatoResumen etiqueta="Proyecto" valor={proyecto ?? "—"} />
      <DatoResumen etiqueta="Cuenta de servicio" valor={correo ?? "—"} />
      <div>
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Seguridad
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <Icon name="shield" size="sm" />
          Credenciales protegidas
        </span>
      </div>
    </div>
  );
}

function DatoResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {etiqueta}
      </span>
      <span className="mt-1 block truncate font-mono text-sm text-ink-900">
        {valor}
      </span>
    </div>
  );
}
