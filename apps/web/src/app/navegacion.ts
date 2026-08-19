import type { IconName } from "@/compartido/componentes/ui/icon";

export type RutaNav =
  | "/"
  | "/reportes"
  | "/descargas"
  | "/configuracion"
  | "/admin/superadmins";

export const NAVEGACION: readonly {
  to: RutaNav;
  etiqueta: string;
  icono: IconName;
  admin?: boolean;
  superadmin?: boolean;
}[] = [
  { to: "/", etiqueta: "Inicio", icono: "home" },
  { to: "/reportes", etiqueta: "Reportes", icono: "file-text" },
  { to: "/descargas", etiqueta: "Descargas", icono: "cloud" },
  {
    to: "/configuracion",
    etiqueta: "Configuración",
    icono: "admin",
    admin: true,
  },
] as const;
