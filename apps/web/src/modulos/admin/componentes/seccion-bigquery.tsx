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
  const [editando, setEditando] = useState(false);
  const [dataset, setDataset] = useState("");
  const [credencialesJson, setCredencialesJson] = useState("");
  const consulta = useQuery({
    queryKey: [CLAVE_CONSULTA, organizacionId, tenantQlikId],
    queryFn: () =>
      obtenerConfiguracionBigQuery(organizacionId, tenantQlikId ?? ""),
    enabled: Boolean(tenantQlikId),
  });
  const configuracion = consulta.data;
  useEffect(() => {
    if (configuracion?.dataset !== undefined) setDataset(configuracion.dataset);
  }, [configuracion?.dataset]);
  const analisis = useMemo(
    () =>
      credencialesJson.trim()
        ? analizarCredencialesBigQuery(credencialesJson)
        : undefined,
    [credencialesJson],
  );
  const habilitado = puedeGuardarBigQuery({
    dataset,
    credencialesJson,
    credencialesConfiguradas: configuracion?.credencialesConfiguradas ?? false,
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!tenantQlikId) throw new Error("Primero configura Qlik Cloud");
      if (!habilitado)
        throw new Error(
          analisis?.error ??
            "Ingresa un dataset válido y las credenciales requeridas",
        );
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
      setEditando(false);
      queryClient.setQueryData(
        [CLAVE_CONSULTA, organizacionId, tenantQlikId],
        resultado,
      );
      mostrarExito("Configuración de BigQuery guardada");
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const probar = useMutation<
    { exitoso: boolean; mensaje: string },
    Error,
    boolean
  >({
    mutationFn: async (guardarPendientes) => {
      let idActual = configuracion?.id;
      if (guardarPendientes) {
        const guardada = await guardar.mutateAsync();
        idActual = guardada.id;
      }
      if (!idActual) throw new Error("Primero guarda BigQuery");
      return probarConfiguracionBigQuery(idActual);
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

  if (!tenantQlikId) return <BigQuerySinTenant />;
  const configurada = Boolean(configuracion?.configurada && configuracion.id);
  const cancelar = () => {
    setDataset(configuracion?.dataset ?? "");
    setCredencialesJson("");
    setEditando(false);
  };

  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
              <Icon name="db" className="text-obj-600" /> BigQuery
            </CardTitle>
            <p className="mt-1 text-xs text-ink-500">
              Cuenta de servicio y dataset utilizados por reportes y resultados.
            </p>
          </div>
          <EstadoBigQuery configuracion={configuracion} />
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {consulta.isLoading ? (
          <p className="text-sm text-ink-500">
            Consultando la configuración de BigQuery…
          </p>
        ) : consulta.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            No se pudo cargar BigQuery. Recarga la página e inténtalo de nuevo.
          </div>
        ) : configurada && configuracion && !editando ? (
          <ResumenConexionBigQuery
            configuracion={configuracion}
            probando={probar.isPending}
            onEditar={() => setEditando(true)}
            onProbar={() => probar.mutate(false)}
          />
        ) : (
          <FormularioBigQuery
            configuracion={configuracion}
            dataset={dataset}
            credencialesJson={credencialesJson}
            analisis={analisis}
            habilitado={habilitado}
            guardando={guardar.isPending || probar.isPending}
            mostrarCancelar={configurada}
            onDataset={setDataset}
            onCredenciales={setCredencialesJson}
            onCancelar={cancelar}
            onGuardar={() => guardar.mutate()}
            onGuardarYProbar={() => probar.mutate(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ResumenConexionBigQuery({
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
      <div className="grid gap-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <DatoResumen
          etiqueta="Proyecto"
          valor={configuracion.projectId ?? "—"}
        />
        <DatoResumen etiqueta="Dataset" valor={configuracion.dataset ?? "—"} />
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

function FormularioBigQuery({
  configuracion,
  dataset,
  credencialesJson,
  analisis,
  habilitado,
  guardando,
  mostrarCancelar,
  onDataset,
  onCredenciales,
  onCancelar,
  onGuardar,
  onGuardarYProbar,
}: {
  configuracion?: ConfiguracionBigQuery;
  dataset: string;
  credencialesJson: string;
  analisis?: ReturnType<typeof analizarCredencialesBigQuery>;
  habilitado: boolean;
  guardando: boolean;
  mostrarCancelar: boolean;
  onDataset: (v: string) => void;
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
          Configura primero un entorno Qlik Cloud para asociar BigQuery.
        </div>
      </CardContent>
    </Card>
  );
}
function EstadoBigQuery({
  configuracion,
}: { configuracion?: ConfiguracionBigQuery }) {
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
function DatoResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {etiqueta}
      </span>
      <span
        className="mt-1 block truncate font-mono text-sm text-ink-900"
        title={valor}
      >
        {valor}
      </span>
    </div>
  );
}
