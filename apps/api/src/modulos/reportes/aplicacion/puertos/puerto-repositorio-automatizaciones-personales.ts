export type EstadoAutomatizacionPersonal = "activo" | "error" | "desactivado";

export interface CrearAutomatizacionPersonalPersistida {
  organizacionId: string;
  tenantQlikId: string;
  usuarioId: string;
  automatizacionIdQlik: string;
  automatizacionNombreSnapshot: string;
  estado: EstadoAutomatizacionPersonal;
  mensajeError?: string | null;
}

export interface AutomatizacionPersonalPersistida
  extends CrearAutomatizacionPersonalPersistida {
  id: string;
  creadoEn?: Date;
  actualizadoEn?: Date;
}

export interface ActualizarAutomatizacionPersonalPersistida {
  automatizacionIdQlik?: string;
  automatizacionNombreSnapshot?: string;
  estado?: EstadoAutomatizacionPersonal;
  mensajeError?: string | null;
}

export interface PuertoRepositorioAutomatizacionesPersonales {
  obtener(
    usuarioId: string,
    tenantQlikId: string,
  ): Promise<AutomatizacionPersonalPersistida | null>;
  crear(
    entrada: CrearAutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida>;
  actualizar(
    id: string,
    cambios: ActualizarAutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida>;
  actualizarScoped(
    id: string,
    organizacionId: string,
    tenantQlikId: string,
    cambios: ActualizarAutomatizacionPersonalPersistida,
  ): Promise<AutomatizacionPersonalPersistida>;
  listarPorTenant(
    tenantQlikId: string,
    organizacionId: string,
  ): Promise<AutomatizacionPersonalPersistida[]>;
}
