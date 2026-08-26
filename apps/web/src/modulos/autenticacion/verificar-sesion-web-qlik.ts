export type EstadoSesionWebQlik =
  | "autenticada"
  | "no_autenticada"
  | "indeterminada"
  | "no_configurada";

export type AccionSesionWebQlik = "continuar" | "marcar_verificada" | "cerrar";

export function decidirAccionSesionWebQlik(
  estado: EstadoSesionWebQlik,
  sesionWebVerificadaAntes: boolean,
): AccionSesionWebQlik {
  if (estado === "autenticada") return "marcar_verificada";
  if (estado === "no_autenticada" && sesionWebVerificadaAntes) return "cerrar";
  return "continuar";
}

export async function verificarSesionWebQlik(entrada: {
  tenantHost: string;
  webIntegrationId: string;
  fetchFn?: typeof fetch;
}): Promise<EstadoSesionWebQlik> {
  const webIntegrationId = entrada.webIntegrationId.trim();
  if (!webIntegrationId) return "no_configurada";

  const tenantHost = entrada.tenantHost.trim().replace(/^https?:\/\//i, "");
  const fetchFn = entrada.fetchFn ?? fetch;

  try {
    const respuesta = await fetchFn(`https://${tenantHost}/api/v1/users/me`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "qlik-web-integration-id": webIntegrationId,
      },
    });

    if (respuesta.status === 200) return "autenticada";
    if (respuesta.status === 401) return "no_autenticada";
    return "indeterminada";
  } catch {
    return "indeterminada";
  }
}
