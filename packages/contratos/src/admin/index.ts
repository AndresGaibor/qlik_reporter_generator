import { z } from "zod";

export const esquemaTenantResumen = z.object({
  id: z.string(),
  nombre: z.string(),
  slug: z.string(),
  estado: z.string(),
  cantidadUsuarios: z.number(),
  creadoEn: z.string(),
});

export const esquemaUsuarioTenant = z.object({
  id: z.string(),
  correo: z.string().nullable(),
  nombre: z.string(),
  rol: z.enum(["admin", "usuario"]),
});

export const esquemaDetalleTenant = z.object({
  id: z.string(),
  nombre: z.string(),
  slug: z.string(),
  estado: z.string(),
  creadoEn: z.string(),
  usuarios: z.array(esquemaUsuarioTenant),
});

export const esquemaCrearTenant = z.object({
  nombre: z.string().min(1).max(255),
});

export const esquemaActualizarTenant = z.object({
  nombre: z.string().min(1).max(255).optional(),
  estado: z.enum(["activa", "suspendida"]).optional(),
});

export const esquemaAgregarUsuario = z.object({
  correo: z.string().min(3),
  rol: z.enum(["admin", "usuario"]),
});

export const esquemaActualizarUsuario = z.object({
  rol: z.enum(["admin", "usuario"]),
});

export type TenantResumen = z.infer<typeof esquemaTenantResumen>;
export type UsuarioTenant = z.infer<typeof esquemaUsuarioTenant>;
export type DetalleTenant = z.infer<typeof esquemaDetalleTenant>;
export type CrearTenant = z.infer<typeof esquemaCrearTenant>;
export type ActualizarTenant = z.infer<typeof esquemaActualizarTenant>;
export type AgregarUsuario = z.infer<typeof esquemaAgregarUsuario>;
export type ActualizarUsuario = z.infer<typeof esquemaActualizarUsuario>;

export const esquemaTenantQlik = z.object({
  id: z.string(),
  organizacionId: z.string(),
  tenantIdQlik: z.string(),
  host: z.string(),
  nombre: z.string().nullable(),
  estado: z.enum(["activo", "desconectado", "suspendido"]),
  esPrincipal: z.boolean(),
  automatizacionBaseIdQlik: z.string().nullable().optional(),
  automatizacionBaseNombre: z.string().nullable().optional(),
  dataflowBaseIdQlik: z.string().nullable().optional(),
  dataflowBaseNombre: z.string().nullable().optional(),
  dataflowPlantillas: z
    .array(z.object({ id: z.string(), nombre: z.string() }))
    .optional(),
  creadoEn: z.string(),
});

export const esquemaCrearTenantQlik = z.object({
  tenantIdQlik: z.string().min(1).max(255).optional(),
  host: z.string().min(1).max(255),
  nombre: z.string().min(1).max(255).optional(),
});

export const esquemaConfigurarAutomatizacionBase = z.object({
  automatizacionBaseIdQlik: z.string().min(1),
  automatizacionBaseNombre: z.string().optional(),
});

export const esquemaConfigurarDataflowBase = z.object({
  plantillas: z
    .array(z.object({ id: z.string().min(1), nombre: z.string().min(1) }))
    .min(1),
});

export type TenantQlik = z.infer<typeof esquemaTenantQlik>;
export type CrearTenantQlik = z.infer<typeof esquemaCrearTenantQlik>;
export type ConfigurarAutomatizacionBase = z.infer<
  typeof esquemaConfigurarAutomatizacionBase
>;
export type ConfigurarDataflowBase = z.infer<
  typeof esquemaConfigurarDataflowBase
>;

export const esquemaCredencialesBigQuery = z.object({
  type: z.literal("service_account"),
  project_id: z.string().trim().min(1),
  client_email: z.string().trim().email(),
  private_key: z
    .string()
    .min(1)
    .refine((valor) => valor.includes("BEGIN PRIVATE KEY"), {
      message: "La clave privada del JSON no es válida",
    }),
});

export const esquemaConfigurarBigQuery = z.object({
  dataset: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .regex(
      /^[A-Za-z0-9_]+$/,
      "El dataset solo admite letras, números y guion bajo",
    ),
  credencialesJson: z.string().trim().min(1).optional(),
  gcsUri: z
    .string()
    .trim()
    .regex(
      /^gs:\/\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\s]+\/$/,
      "Usa una ruta v?lida con formato gs://bucket/prefijo/",
    )
    .optional(),
  limiteMiB: z.number().positive().optional(),
  limiteUsd: z.number().positive().optional(),
  maximoFilasPorArchivo: z.number().int().min(1).max(1_000_000).default(1_000_000),
  precioUsdPorTib: z.number().positive().default(6.25),
});

export const esquemaConfiguracionBigQuery = z.object({
  configurada: z.boolean(),
  id: z.string().optional(),
  estado: z.enum(["activo", "error", "desconectado"]).optional(),
  projectId: z.string().optional(),
  dataset: z.string().optional(),
  gcsUri: z.string().optional(),
  clientEmail: z.string().email().optional(),
  credencialesConfiguradas: z.boolean(),
  maximoFilasPorArchivo: z.number().int().min(1).max(1_000_000).default(1_000_000),
  mensajeError: z.string().nullable().optional(),
});

export type CredencialesBigQuery = z.infer<typeof esquemaCredencialesBigQuery>;
export type ConfigurarBigQuery = z.infer<typeof esquemaConfigurarBigQuery>;
export type ConfiguracionBigQuery = z.infer<
  typeof esquemaConfiguracionBigQuery
>;

export const esquemaEstadoConfiguracionOauth = z.enum([
  "pendiente",
  "verificada",
  "error",
  "desactivada",
]);

export const esquemaOrigenConfiguracionOauth = z.enum([
  "tenant",
  "entorno_global",
  "sin_configurar",
]);

export const esquemaConfigurarOauthQlik = z.object({
  clienteId: z.string().trim().min(1).max(500),
  clienteSecreto: z.string().min(8).max(2000).optional(),
  scopes: z.array(z.string().trim().min(1).max(200)).min(1),
});

export const esquemaConfiguracionOauthQlik = z.object({
  tenantQlikId: z.string(),
  clienteId: z.string().nullable(),
  secretoMascara: z.string().nullable(),
  scopes: z.array(z.string()),
  estado: esquemaEstadoConfiguracionOauth.nullable(),
  origen: esquemaOrigenConfiguracionOauth,
  verificadaEn: z.string().nullable(),
  ultimoError: z.string().nullable(),
  actualizadoEn: z.string().nullable(),
  redirectUri: z.string().url(),
});
export type EstadoConfiguracionOauth = z.infer<
  typeof esquemaEstadoConfiguracionOauth
>;
export type OrigenConfiguracionOauth = z.infer<
  typeof esquemaOrigenConfiguracionOauth
>;
export type ConfigurarOauthQlik = z.infer<typeof esquemaConfigurarOauthQlik>;
export type ConfiguracionOauthQlik = z.infer<
  typeof esquemaConfiguracionOauthQlik
>;

export const esquemaSuperadmin = z.object({
  id: z.string(),
  nombre: z.string(),
  correo: z.string().nullable(),
  estado: z.enum(["activo", "suspendido"]),
  esSuperadmin: z.boolean(),
  creadoEn: z.string(),
});

export const esquemaAgregarSuperadmin = z.object({
  nombre: z.string().min(1).max(255),
  correo: z.string().email("Debe ser un correo electrónico válido"),
});

export type Superadmin = z.infer<typeof esquemaSuperadmin>;
export type AgregarSuperadmin = z.infer<typeof esquemaAgregarSuperadmin>;
