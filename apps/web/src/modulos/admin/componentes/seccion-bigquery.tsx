import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { normalizarError } from "@/compartido/errores/normalizar-error";
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
import { FormularioBigQuery } from "./formulario-bigquery";
import { ResumenConexionBigQuery } from "./resumen-conexion-bigquery";

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
  const [gcsUri, setGcsUri] = useState("gs://bkt_dwh/POCs/TalendDescargados/");
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
    if (configuracion?.gcsUri) setGcsUri(configuracion.gcsUri);
  }, [configuracion?.dataset, configuracion?.gcsUri]);
  const analisis = useMemo(
    () =>
      credencialesJson.trim()
        ? analizarCredencialesBigQuery(credencialesJson)
        : undefined,
    [credencialesJson],
  );
  const habilitado = puedeGuardarBigQuery({
    dataset,
    gcsUri,
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
        gcsUri: gcsUri.trim(),
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
    onError: (error: Error) => mostrarError(normalizarError(error).mensaje),
  });

  const probar = useMutation<
    { exitoso: boolean; mensaje: string },
    Error,
    boolean
  >({
    mutationFn: async (guardarPendientes) => {
      if (guardarPendientes) await guardar.mutateAsync();
      if (!tenantQlikId) throw new Error("Primero configura Qlik Cloud");
      return probarConfiguracionBigQuery(organizacionId, tenantQlikId);
    },
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({
        queryKey: [CLAVE_CONSULTA, organizacionId, tenantQlikId],
      });
      if (resultado.exitoso) mostrarExito(resultado.mensaje);
      else mostrarError(resultado.mensaje);
    },
    onError: (error: Error) => mostrarError(normalizarError(error).mensaje),
  });

  if (!tenantQlikId) return <BigQuerySinTenant />;
  const configurada = Boolean(configuracion?.configurada && configuracion.id);
  const cancelar = () => {
    setDataset(configuracion?.dataset ?? "");
    setGcsUri(configuracion?.gcsUri ?? "gs://bkt_dwh/POCs/TalendDescargados/");
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
            gcsUri={gcsUri}
            credencialesJson={credencialesJson}
            analisis={analisis}
            habilitado={habilitado}
            guardando={guardar.isPending || probar.isPending}
            mostrarCancelar={configurada}
            onDataset={setDataset}
            onGcsUri={setGcsUri}
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
