import type {
  DetalleAutomatizacion,
  EjecucionAutomatizacion,
  EspacioDisponible,
  ResumenAutomatizacion,
} from "@qlik/contratos/automatizaciones";
import type {
  AutomatizacionQlik,
  EjecucionQlik,
  EspacioQlik,
  UsuarioQlik,
} from "../../qlik/dominio/modelos-qlik.js";
import { estaEjecucionEnCurso } from "../dominio/estado-ejecucion.js";

export const normalizarTexto = (
  valor: string | null | undefined,
): string | undefined => {
  const normalizado = valor?.trim();
  return normalizado ? normalizado : undefined;
};

export function crearMapaEspacios(
  espacios: EspacioQlik[],
): Map<string, string> {
  return new Map(
    espacios
      .map((espacio) => [espacio.id, normalizarTexto(espacio.name)] as const)
      .filter((entrada): entrada is readonly [string, string] => !!entrada[1]),
  );
}

export function crearMapaUsuarios(
  usuarios: UsuarioQlik[],
): Map<string, string> {
  return new Map(
    usuarios
      .map(
        (usuario) =>
          [
            usuario.id,
            normalizarTexto(usuario.name) ??
              normalizarTexto(usuario.email) ??
              normalizarTexto(usuario.subject),
          ] as const,
      )
      .filter((entrada): entrada is readonly [string, string] => !!entrada[1]),
  );
}

export function aResumenAutomatizacion(
  automatizacion: AutomatizacionQlik,
  espacios: Map<string, string>,
  usuarios: Map<string, string>,
): ResumenAutomatizacion {
  const espacioId = normalizarTexto(automatizacion.spaceId);
  const propietarioId =
    normalizarTexto(automatizacion.ownerId) ??
    normalizarTexto(automatizacion.owner?.id);
  const ultimaEjecucion =
    automatizacion.lastRun ?? automatizacion.lastExecution;
  const activa =
    automatizacion.isEnabled ?? automatizacion.state === "available";
  const ultimaEjecucionEstado =
    normalizarTexto(ultimaEjecucion?.status) ??
    normalizarTexto(automatizacion.lastRunStatus);
  const ultimaEjecucionInicio =
    normalizarTexto(ultimaEjecucion?.startTime) ??
    normalizarTexto(ultimaEjecucion?.createdAt) ??
    normalizarTexto(automatizacion.lastRunAt);
  const ultimaEjecucionFin = normalizarTexto(ultimaEjecucion?.stopTime);
  const ejecucionActiva = ultimaEjecucionEstado
    ? estaEjecucionEnCurso(ultimaEjecucionEstado)
    : false;

  let autorNombre: string | undefined = undefined;
  const descripcion = normalizarTexto(automatizacion.description);
  if (descripcion?.startsWith("Creado por ")) {
    autorNombre = descripcion.replace(/^Creado por\s+/, "").trim();
  } else if (automatizacion.name?.startsWith("Reporte ")) {
    const partes = automatizacion.name.split(" ");
    if (partes.length >= 3) {
      autorNombre = partes.slice(2).join(" ");
    }
  }

  const propietarioNombre =
    autorNombre ??
    normalizarTexto(automatizacion.owner?.name) ??
    (propietarioId
      ? (usuarios.get(propietarioId) ?? propietarioId)
      : "Sin propietario");

  return {
    id: automatizacion.id,
    nombre: automatizacion.name,
    ...(espacioId ? { espacioId } : {}),
    espacioNombre: espacioId
      ? (espacios.get(espacioId) ?? espacioId)
      : "Espacio personal",
    ...(propietarioId ? { propietarioId } : {}),
    propietarioNombre,
    activa,
    modoEjecucion:
      automatizacion.runMode ?? automatizacion.triggerType ?? "desconocido",
    ejecucionActiva,
    puedeEjecutar: activa && !ejecucionActiva,
    ...(ultimaEjecucionEstado ? { ultimaEjecucionEstado } : {}),
    ...(ultimaEjecucionInicio ? { ultimaEjecucionInicio } : {}),
    ...(ultimaEjecucionFin ? { ultimaEjecucionFin } : {}),
    creadoEn: automatizacion.createdAt ?? automatizacion.createdDate ?? "",
    modificadoEn: automatizacion.updatedAt ?? automatizacion.modifiedDate ?? "",
  };
}

export function aEjecucion(
  ejecucion: EjecucionQlik,
  automatizacionId?: string,
): EjecucionAutomatizacion {
  return {
    id: ejecucion.id,
    ...(ejecucion.automationId || automatizacionId
      ? { automatizacionId: ejecucion.automationId ?? automatizacionId }
      : {}),
    estado: ejecucion.status,
    ...((ejecucion.startTime ?? ejecucion.createdAt)
      ? { iniciadoEn: ejecucion.startTime ?? ejecucion.createdAt }
      : {}),
    ...(ejecucion.stopTime ? { finalizadoEn: ejecucion.stopTime } : {}),
    ...(ejecucion.error ? { error: ejecucion.error } : {}),
  };
}

export function aDetalleAutomatizacion(
  automatizacion: AutomatizacionQlik,
  ejecuciones: EjecucionQlik[],
  espacios: Map<string, string>,
  usuarios: Map<string, string>,
): DetalleAutomatizacion {
  return {
    automatizacion: aResumenAutomatizacion(automatizacion, espacios, usuarios),
    ejecuciones: ejecuciones.map((ejecucion) =>
      aEjecucion(ejecucion, automatizacion.id),
    ),
  };
}

export function aEspacioDisponible(espacio: EspacioQlik): EspacioDisponible {
  return {
    id: espacio.id,
    nombre: normalizarTexto(espacio.name) ?? "Espacio sin nombre",
    tipo: espacio.type,
    ...(espacio.ownerId ? { propietarioId: espacio.ownerId } : {}),
    roles: espacio.meta?.roles ?? [],
    acciones: espacio.meta?.actions ?? [],
  };
}
