export function hashRiesgoDevuelto(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const apiError = error as { codigo?: unknown; detalles?: unknown };
  if (apiError.codigo !== "EXECUTION_RISK_CONFIRMATION_REQUIRED") return null;
  const detalles = apiError.detalles;
  if (!detalles || typeof detalles !== "object") return null;
  const hash = (detalles as { hashDataflowSha256?: unknown })
    .hashDataflowSha256;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}
