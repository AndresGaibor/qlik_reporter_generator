import type { tenantsQlik } from "../../../plataforma/persistencia/esquema.js";
import type {
  EstadoTenantQlik,
  TenantQlikAdministrable,
} from "../aplicacion/puertos/repositorio-administracion.js";
import { validarYNormalizarHost } from "../dominio/validador-host-qlik.js";

export function mapearTenantQlik(
  fila: typeof tenantsQlik.$inferSelect,
): TenantQlikAdministrable {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    tenantIdQlik: fila.tenantIdQlik,
    host: fila.host,
    nombre: fila.nombre,
    estado: fila.estado as EstadoTenantQlik,
    esPrincipal: fila.esPrincipal,
    automatizacionBaseIdQlik: fila.automatizacionBaseIdQlik,
    automatizacionBaseNombre: fila.automatizacionBaseNombre,
    creadoEn: fila.creadoEn,
  };
}

export function normalizarHostQlik(host: string): string {
  return validarYNormalizarHost(host);
}
