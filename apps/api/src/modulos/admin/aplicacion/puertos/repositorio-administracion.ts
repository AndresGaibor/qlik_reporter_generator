export type RolAdministracion = "admin" | "usuario";
export type EstadoOrganizacion = "activa" | "suspendida";
export type EstadoTenantQlik = "activo" | "desconectado" | "suspendido";

export interface OrganizacionAdministrable {
  id: string;
  nombre: string;
  estado: EstadoOrganizacion;
  creadoEn: Date;
}

export interface TenantQlikAdministrable {
  id: string;
  organizacionId: string;
  tenantIdQlik: string;
  host: string;
  nombre: string | null;
  estado: EstadoTenantQlik;
  esPrincipal: boolean;
  automatizacionBaseIdQlik?: string | null;
  automatizacionBaseNombre?: string | null;
  dataflowBaseIdQlik?: string | null;
  dataflowBaseNombre?: string | null;
  creadoEn: Date;
}

export type ResultadoEliminarTenantQlik =
  | "ELIMINADO"
  | "NO_ENCONTRADO"
  | "REQUIERE_REEMPLAZO";

export interface UsuarioAdministrable {
  id: string;
  correo: string | null;
  nombre: string;
  rol: RolAdministracion;
}

export type EstadoConfiguracionOauth =
  | "pendiente"
  | "verificada"
  | "error"
  | "desactivada";

export interface ConfiguracionOauthAdministrable {
  tenantQlikId: string;
  clienteId: string;
  secretoMascara: string;
  scopes: string[];
  estado: EstadoConfiguracionOauth;
  origen: "tenant";
  verificadaEn: Date | null;
  ultimoError: string | null;
  actualizadoEn: Date;
}

export interface EntradaGuardarConfiguracionOauth {
  clienteId: string;
  clienteSecreto?: string;
  scopes: string[];
  usuarioId?: string;
}

export interface IdentidadQlikAdministrable {
  usuarioIdQlik: string;
  nombreQlik?: string | null;
  correoQlik?: string | null;
}

export interface PuertoConsultaIdentidadQlikAdmin {
  obtener(
    usuarioId: string,
    tenantQlikId: string,
  ): Promise<IdentidadQlikAdministrable | null>;
}

export interface ServicioCifradoAdministracion {
  cifrar(valor: string): { cifrado: string; iv: string; tag: string };
  descifrar(cifrado: string, iv: string, tag: string): string;
}

export interface SuperadminAdministrable {
  id: string;
  nombre: string;
  correo: string | null;
  estado: "activo" | "suspendido";
  esSuperadmin: boolean;
  creadoEn: Date;
}

export type ResultadoEliminarSuperadmin =
  | { exito: true }
  | {
      exito: false;
      mensaje: string;
      codigo: "NO_ENCONTRADO" | "ULTIMO_SUPERADMIN" | "NO_ES_SUPERADMIN";
    };

export interface RepositorioAdministracion {
  listarOrganizaciones(): Promise<
    Array<OrganizacionAdministrable & { cantidadUsuarios: number }>
  >;
  obtenerOrganizacion(id: string): Promise<OrganizacionAdministrable | null>;
  crearOrganizacion(nombre: string): Promise<OrganizacionAdministrable>;
  actualizarOrganizacion(
    id: string,
    cambios: Partial<Pick<OrganizacionAdministrable, "nombre" | "estado">>,
  ): Promise<OrganizacionAdministrable | null>;
  eliminarOrganizacion(id: string): Promise<boolean>;
  listarUsuarios(organizacionId: string): Promise<UsuarioAdministrable[]>;
  agregarUsuario(
    organizacionId: string,
    correo: string,
    rol: RolAdministracion,
  ): Promise<UsuarioAdministrable | null>;
  actualizarRolUsuario(
    organizacionId: string,
    usuarioId: string,
    rol: RolAdministracion,
  ): Promise<UsuarioAdministrable | null>;
  eliminarUsuario(organizacionId: string, usuarioId: string): Promise<boolean>;
  listarTenantsQlik(organizacionId: string): Promise<TenantQlikAdministrable[]>;
  crearTenantQlik(entrada: {
    organizacionId: string;
    tenantIdQlik?: string;
    host: string;
    nombre?: string;
  }): Promise<TenantQlikAdministrable | null>;
  marcarTenantQlikPrincipal(
    organizacionId: string,
    tenantQlikId: string,
  ): Promise<TenantQlikAdministrable | null>;
  configurarAutomatizacionBase(
    organizacionId: string,
    tenantQlikId: string,
    automatizacionBaseIdQlik: string,
    automatizacionBaseNombre?: string,
  ): Promise<TenantQlikAdministrable | null>;
  configurarDataflowBase(
    organizacionId: string,
    tenantQlikId: string,
    dataflowBaseIdQlik: string,
    dataflowBaseNombre?: string,
  ): Promise<TenantQlikAdministrable | null>;
  eliminarTenantQlik(
    organizacionId: string,
    tenantQlikId: string,
  ): Promise<ResultadoEliminarTenantQlik>;
  obtenerConfiguracionOAuth(
    organizacionId: string,
    tenantQlikId: string,
  ): Promise<ConfiguracionOauthAdministrable | null>;
  guardarConfiguracionOAuth(
    organizacionId: string,
    tenantQlikId: string,
    entrada: EntradaGuardarConfiguracionOauth,
  ): Promise<ConfiguracionOauthAdministrable | null>;
  eliminarConfiguracionOAuth(
    organizacionId: string,
    tenantQlikId: string,
  ): Promise<boolean>;
  listarSuperadmins(): Promise<SuperadminAdministrable[]>;
  agregarSuperadmin(entrada: {
    nombre: string;
    correo: string;
  }): Promise<SuperadminAdministrable | null>;
  eliminarSuperadmin(id: string): Promise<ResultadoEliminarSuperadmin>;
}
