export interface PuertoConsultaTenantQlik {
  obtenerTenant(tenantQlikId: string): Promise<{
    host: string;
    automatizacionBaseIdQlik?: string | null;
    automatizacionBaseNombre?: string | null;
    dataflowBaseIdQlik?: string | null;
    dataflowBaseNombre?: string | null;
    dataflowPlantillas?: Array<{ id: string; nombre: string }>;
  } | null>;
}
