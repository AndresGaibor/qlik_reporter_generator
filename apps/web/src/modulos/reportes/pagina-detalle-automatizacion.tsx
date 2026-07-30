import { useVistaUsuarioFinal } from "@/app/contexto-vista";
import { EstadoError } from "@/compartido/componentes/feedback/estado-error";
import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { estaEnCurso } from "@/compartido/utiles/estados-ejecucion";
import { obtenerSesion } from "@/modulos/autenticacion/api";
import {
  type DetalleAutomatizacion,
  type EjecucionResumen,
  type WorkspaceAutomatizacion,
  actualizarWorkspaceAutomatizacion,
  clonarAutomatizacion,
  detenerEjecucion,
  ejecutarAutomatizacion,
  obtenerDetalleAutomatizacion,
  obtenerWorkspaceAutomatizacion,
} from "@/modulos/reportes/api";
import { ListaEjecuciones } from "@/modulos/reportes/componentes/lista-ejecuciones";
import { ModalClonarAutomatizacion } from "@/modulos/reportes/componentes/modal-clonar-automatizacion";
import { TarjetaDetalleAutomatizacion } from "@/modulos/reportes/componentes/tarjeta-detalle-automatizacion";
import { VisorWorkspace } from "@/modulos/reportes/componentes/visor-workspace";
import {
  type ConfiguracionReporte,
  PaginaNuevaAutomatizacion,
} from "@/modulos/reportes/pagina-nueva-automatizacion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface Props {
  id: string;
}

function valoresWorkspace(workspace: Record<string, unknown>) {
  const valores: Record<string, unknown> = {};
  const variables = Array.isArray(workspace.variables)
    ? workspace.variables
    : [];

  for (const variable of variables) {
    if (typeof variable !== "object" || variable === null) continue;
    const entrada = variable as Record<string, unknown>;
    const nombre = String(entrada.name ?? "");
    if (nombre) valores[nombre] = entrada.value ?? entrada.defaultValue ?? "";
  }

  const bloques = Array.isArray(workspace.blocks) ? workspace.blocks : [];
  for (const bloque of bloques) {
    if (typeof bloque !== "object" || bloque === null) continue;
    const entrada = bloque as Record<string, unknown>;
    const nombre = String(entrada.name ?? "");
    const operaciones = Array.isArray(entrada.operations)
      ? entrada.operations
      : [];
    const primeraOperacion = operaciones[0];

    if (
      entrada.type === "VariableBlock" &&
      nombre &&
      typeof primeraOperacion === "object" &&
      primeraOperacion !== null
    ) {
      const operacion = primeraOperacion as Record<string, unknown>;
      valores[nombre] = operacion.value ?? valores[nombre] ?? "";
    }
  }

  return valores;
}

function fechaWorkspace(valor: unknown) {
  if (!valor) return undefined;
  const fecha = new Date(String(valor));
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

function configuracionInicial(
  workspace: WorkspaceAutomatizacion,
): ConfiguracionReporte {
  const valores = valoresWorkspace(workspace.workspace);
  const desde = fechaWorkspace(valores.fechadesde);
  const hasta = fechaWorkspace(valores.fechahasta);

  return {
    tabla: String(valores.TablaDestino ?? "clientes"),
    columnas: String(valores.campos ?? "")
      .split(/[\n,]/)
      .map((campo) => campo.trim())
      .filter(Boolean),
    rango: desde ? { from: desde, to: hasta } : undefined,
  };
}

function workspaceConConfiguracion(
  workspace: WorkspaceAutomatizacion,
  configuracion: ConfiguracionReporte,
) {
  const valores: Record<string, string> = {
    TablaDestino: configuracion.tabla,
    campos: configuracion.columnas.join(", "),
    fechadesde: configuracion.rango?.from?.toISOString() ?? "",
    fechahasta: configuracion.rango?.to?.toISOString() ?? "",
  };
  const nuevoWorkspace = structuredClone(workspace.workspace);

  if (Array.isArray(nuevoWorkspace.variables)) {
    nuevoWorkspace.variables = nuevoWorkspace.variables.map((variable) => {
      if (typeof variable !== "object" || variable === null) return variable;
      const entrada = variable as Record<string, unknown>;
      const nombre = String(entrada.name ?? "");
      return nombre in valores
        ? { ...entrada, value: valores[nombre] }
        : entrada;
    });
  }

  if (Array.isArray(nuevoWorkspace.blocks)) {
    nuevoWorkspace.blocks = nuevoWorkspace.blocks.map((bloque) => {
      if (typeof bloque !== "object" || bloque === null) return bloque;
      const entrada = bloque as Record<string, unknown>;
      const nombre = String(entrada.name ?? "");
      const operaciones = Array.isArray(entrada.operations)
        ? entrada.operations
        : [];

      if (
        entrada.type !== "VariableBlock" ||
        !(nombre in valores) ||
        operaciones.length === 0
      ) {
        return entrada;
      }

      return {
        ...entrada,
        operations: operaciones.map((operacion, indice) =>
          indice === 0 && typeof operacion === "object" && operacion !== null
            ? {
                ...(operacion as Record<string, unknown>),
                value: valores[nombre],
              }
            : operacion,
        ),
      };
    });
  }

  return nuevoWorkspace;
}

export function PaginaDetalleAutomatizacion({ id }: Props) {
  const modoUsuarioFinal = useVistaUsuarioFinal();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const [modalClonarAbierto, setModalClonarAbierto] = useState(false);

  const { data: sesion } = useQuery({
    queryKey: ["sesion"],
    queryFn: obtenerSesion,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const esAdmin =
    Boolean(sesion?.esSuperadmin) ||
    sesion?.membresias?.some((m) => m.rol === "admin") ||
    false;

  const {
    data: detalle,
    isLoading: cargandoDetalle,
    isError: errorDetalle,
    error: errorDetalleMsg,
  } = useQuery<DetalleAutomatizacion>({
    queryKey: ["automatizacion", id],
    queryFn: () => obtenerDetalleAutomatizacion(id),
    retry: false,
    refetchInterval: (consulta) => {
      const detalleActual = consulta.state.data as
        | DetalleAutomatizacion
        | undefined;
      const automatizacionActual = detalleActual?.automatizacion;
      const ejecucionActiva =
        automatizacionActual?.ejecucionActiva ||
        detalleActual?.ejecuciones.some((ejecucion) =>
          estaEnCurso(ejecucion.estado),
        ) ||
        false;
      return ejecucionActiva ? 3000 : false;
    },
    refetchIntervalInBackground: true,
  });

  const auto = detalle?.automatizacion;
  const ejecuciones = detalle?.ejecuciones;

  const mutationEjecutar = useMutation({
    mutationFn: () => ejecutarAutomatizacion(id),
    onSuccess: () => {
      mostrarExito("Ejecución iniciada");
      queryClient.invalidateQueries({ queryKey: ["automatizacion", id] });
    },
    onError: (err: Error) => mostrarError(err.message),
  });

  const mutationDetener = useMutation({
    mutationFn: (runId: string) => detenerEjecucion(id, runId),
    onSuccess: () => {
      mostrarExito("Ejecución detenida");
      queryClient.invalidateQueries({ queryKey: ["automatizacion", id] });
    },
    onError: (err: Error) => mostrarError(err.message),
  });

  const { data: workspace } = useQuery<WorkspaceAutomatizacion>({
    queryKey: ["workspace", id],
    queryFn: () => obtenerWorkspaceAutomatizacion(id),
    retry: false,
    enabled: true,
  });

  const guardarConfiguracion = useMutation({
    mutationFn: (configuracion: ConfiguracionReporte) => {
      if (!workspace) {
        throw new Error("No se encontró la configuración del reporte");
      }
      return actualizarWorkspaceAutomatizacion(
        id,
        workspaceConConfiguracion(workspace, configuracion),
      );
    },
    onSuccess: async () => {
      mostrarExito("Cambios guardados correctamente");
      await queryClient.invalidateQueries({ queryKey: ["workspace", id] });
      await queryClient.invalidateQueries({ queryKey: ["automatizacion", id] });
    },
    onError: (error: Error) => mostrarError(error.message),
  });

  const mutationClonar = useMutation({
    mutationFn: (nombre: string) => clonarAutomatizacion(id, { nombre }),
    onSuccess: (resultado) => {
      mostrarExito(`Automatización "${resultado.nombre}" clonada`);
      setModalClonarAbierto(false);
      queryClient.invalidateQueries({ queryKey: ["automatizaciones"] });
      navegar({ to: `/reportes/${resultado.id}` });
    },
    onError: (err: Error) => {
      mostrarError(err.message);
      setModalClonarAbierto(false);
    },
  });

  if (cargandoDetalle) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="font-medium text-ink-500">Cargando reporte…</p>
      </div>
    );
  }

  if (errorDetalle) {
    return (
      <EstadoError
        mensaje={
          errorDetalleMsg?.message ?? "Error al cargar el detalle del reporte"
        }
        onReintentar={() =>
          queryClient.invalidateQueries({ queryKey: ["automatizacion", id] })
        }
      />
    );
  }

  if (!auto) return null;

  const ejecutandoActiva = ejecuciones?.find((e: EjecucionResumen) =>
    estaEnCurso(e.estado),
  );
  const ultimaEjecucion = ejecuciones?.reduce<EjecucionResumen | undefined>(
    (ultima, ejecucion) => {
      if (!ultima) return ejecucion;
      const fechaActual = new Date(ejecucion.iniciadoEn ?? 0).getTime();
      const fechaUltima = new Date(ultima.iniciadoEn ?? 0).getTime();
      return fechaActual > fechaUltima ? ejecucion : ultima;
    },
    undefined,
  );
  const hostQlik = sesion?.tenantHost?.trim();
  const urlQlik = hostQlik
    ? new URL(`/automations/${id}`, `https://${hostQlik}`).toString()
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/reportes"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <Icon name="chev" size="sm" className="rotate-180" />
          Volver a reportes
        </Link>
      </div>

      <PageHeader
        title={auto.nombre}
        description={`Orquestación configurada para el espacio ${auto.espacioNombre || "Personal"}`}
      />

      {workspace && (
        <PaginaNuevaAutomatizacion
          configuracionInicial={configuracionInicial(workspace)}
          integrado
          onGuardarCambios={async (configuracion) => {
            await guardarConfiguracion.mutateAsync(configuracion);
          }}
        />
      )}

      <TarjetaDetalleAutomatizacion
        automatizacion={auto}
        ejecutandoActiva={ejecutandoActiva}
        ultimaEjecucion={ultimaEjecucion}
        urlQlik={urlQlik}
        onEjecutar={() => mutationEjecutar.mutate()}
        onDetener={(runId) => mutationDetener.mutate(runId)}
        mutationEjecutar={mutationEjecutar}
        mutationDetener={mutationDetener}
        onClonar={() => setModalClonarAbierto(true)}
        mostrarWorkspace={esAdmin && !modoUsuarioFinal}
      />

      {esAdmin && !modoUsuarioFinal && workspace && (
        <VisorWorkspace workspace={workspace} />
      )}

      <ListaEjecuciones ejecuciones={ejecuciones ?? []} />

      <ModalClonarAutomatizacion
        open={modalClonarAbierto}
        nombreOriginal={auto.nombre}
        cargando={mutationClonar.isPending}
        onConfirmar={(nombre) => mutationClonar.mutate(nombre)}
        onCancelar={() => setModalClonarAbierto(false)}
      />
    </div>
  );
}
