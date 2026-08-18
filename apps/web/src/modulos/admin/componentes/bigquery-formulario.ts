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
  gcsUri: string;
  credencialesJson: string;
  credencialesConfiguradas: boolean;
}

export function puedeGuardarBigQuery({
  dataset,
  gcsUri,
  credencialesJson,
  credencialesConfiguradas,
}: PuedeGuardarBigQueryEntrada): boolean {
  const datasetValido = /^[A-Za-z0-9_]+$/.test(dataset.trim());
  const gcsLimpio = gcsUri.trim();
  const gcsValido = /^gs:\/\/[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]\/[^\s]+\/$/.test(
    gcsLimpio,
  );
  const tieneTraversal = gcsLimpio.split("/").includes("..");
  if (!datasetValido || !gcsValido || tieneTraversal) return false;
  if (!credencialesJson.trim()) return credencialesConfiguradas;
  return analizarCredencialesBigQuery(credencialesJson).valido;
}

export function separarUriGcs(uri: string): {
  bucket: string;
  prefijo: string;
} {
  const match = uri.trim().match(/^gs:\/\/([^/]+)\/(.+)$/);
  return {
    bucket: match?.[1] ?? "",
    prefijo: match?.[2] ?? "",
  };
}

export function construirUriGcs(bucket: string, prefijo: string): string {
  const bucketLimpio = bucket.trim();
  const prefijoLimpio = prefijo.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return `gs://${bucketLimpio}/${prefijoLimpio}/`;
}
