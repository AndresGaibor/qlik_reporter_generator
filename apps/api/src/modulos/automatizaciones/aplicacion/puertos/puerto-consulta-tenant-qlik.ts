export interface PuertoConsultaTenantQlik {
  obtenerTenant(tenantQlikId: string): Promise<{
    host: string;
    automatizacionBaseIdQlik?: string | null;
    automatizacionBaseNombre?: string | null;
  } | null>;
}
