interface ResultadoCredencialesBigQuery {
  valido: boolean;
  projectId?: string;
  clientEmail?: string;
  error?: string;
}

export function analizarCredencialesBigQuery(
  texto: string,
): ResultadoCredencialesBigQuery {
  const limpio = texto.trim();
  if (!limpio) {
    return { valido: false, error: "Pega el JSON de la cuenta de servicio" };
  }

  try {
    const valor = JSON.parse(limpio) as Record<string, unknown>;
    if (valor.type !== "service_account") {
      return {
        valido: false,
        error: "El JSON debe ser de tipo service_account",
      };
    }
    if (
      typeof valor.project_id !== "string" ||
      typeof valor.client_email !== "string" ||
      typeof valor.private_key !== "string" ||
      !valor.private_key.includes("BEGIN PRIVATE KEY")
    ) {
      return {
        valido: false,
        error: "El JSON no contiene proyecto, correo y clave privada válidos",
      };
    }
    return {
      valido: true,
      projectId: valor.project_id,
      clientEmail: valor.client_email,
    };
  } catch {
    return { valido: false, error: "El JSON no tiene un formato válido" };
  }
}
interface PuedeGuardarBigQueryEntrada {
  dataset: string;
  credencialesJson: string;
  credencialesConfiguradas: boolean;
}

export function puedeGuardarBigQuery({
  dataset,
  credencialesJson,
  credencialesConfiguradas,
}: PuedeGuardarBigQueryEntrada): boolean {
  const datasetValido = /^[A-Za-z0-9_]+$/.test(dataset.trim());
  if (!datasetValido) return false;
  if (!credencialesJson.trim()) return credencialesConfiguradas;
  return analizarCredencialesBigQuery(credencialesJson).valido;
}
