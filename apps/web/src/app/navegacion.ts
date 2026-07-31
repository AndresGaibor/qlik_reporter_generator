import type { IconName } from "@/compartido/componentes/ui/icon";

export type RutaNav =
  | "/"
  | "/reportes"
  | "/tablas"
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
  {
    to: "/tablas",
    etiqueta: "Resultados",
    icono: "db",
    admin: true,
  },
  {
    to: "/configuracion",
    etiqueta: "Configuración",
    icono: "admin",
    admin: true,
  },
  {
    to: "/admin/superadmins",
    etiqueta: "Superadmins",
    icono: "shield",
    superadmin: true,
  },
] as const;
