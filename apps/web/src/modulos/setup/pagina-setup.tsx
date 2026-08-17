import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import { Button } from "@/compartido/componentes/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { type EntradaSetup, completarSetup } from "@/modulos/setup/api";
import { SCOPES_OAUTH_PREDETERMINADOS } from "@/modulos/setup/scopes-oauth";
import { useState } from "react";
import {
  type FormularioSetupData,
  Paso1Empresa,
} from "./componentes/paso-1-empresa";
import { Paso2QlikCloud } from "./componentes/paso-2-qlik";
import { Paso3Admin } from "./componentes/paso-3-admin";

const PASOS = [
  { numero: 1, titulo: "Empresa", descripcion: "Identificación" },
  { numero: 2, titulo: "Qlik Cloud", descripcion: "Credenciales OAuth" },
  { numero: 3, titulo: "Administrador", descripcion: "Acceso inicial" },
] as const;

function calcularRedirectUri(): string {
  if (typeof window !== "undefined") {
    const protocolo = window.location.protocol === "https:" ? "https" : "http";
    const puerto = window.location.port ? `:${window.location.port}` : "";
    return `${protocolo}://${window.location.hostname}${puerto}/api/auth/qlik/callback`;
  }
  return "http://localhost:4523/api/auth/qlik/callback";
}

function crearEstadoInicial(): FormularioSetupData {
  return {
    organizacionNombre: "",
    qlikTenantHost: "",
    qlikClientId: "",
    qlikClientSecret: "",
    qlikScopes: [...SCOPES_OAUTH_PREDETERMINADOS],
    superadminNombre: "",
    superadminCorreo: "",
    qlikRedirectUri: calcularRedirectUri(),
  };
}

export function PaginaSetup() {
  const { mostrarExito, mostrarError } = useNotificaciones();
  const [paso, setPaso] = useState(1);
  const [formulario, setFormulario] =
    useState<FormularioSetupData>(crearEstadoInicial);
  const [enviando, setEnviando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  const actualizarCampo = <K extends keyof FormularioSetupData>(
    campo: K,
    valor: FormularioSetupData[K],
  ) => {
    setErrorFormulario(null);
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  };

  const informarError = (mensaje: string) => {
    setErrorFormulario(mensaje);
    mostrarError(mensaje);
    return false;
  };

  const validarPaso1 = () =>
    formulario.organizacionNombre.trim().length >= 2 ||
    informarError("El nombre de la empresa debe tener al menos 2 caracteres.");

  const validarPaso2 = () => {
    if (!formulario.qlikTenantHost.trim()) {
      return informarError(
        "La dirección del tenant de Qlik Cloud es obligatoria.",
      );
    }
    if (!formulario.qlikClientId.trim()) {
      return informarError("El Client ID de OAuth es obligatorio.");
    }
    if (!formulario.qlikClientSecret.trim()) {
      return informarError("El Client Secret de OAuth es obligatorio.");
    }
    return (
      formulario.qlikScopes.length > 0 ||
      informarError("Debes configurar al menos un scope de OAuth.")
    );
  };

  const validarPaso3 = () => {
    if (formulario.superadminNombre.trim().length < 2) {
      return informarError(
        "El nombre del administrador debe tener al menos 2 caracteres.",
      );
    }
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.superadminCorreo) ||
      informarError("El correo electrónico del administrador no es válido.")
    );
  };

  const handleSiguiente = () => {
    const valido = paso === 1 ? validarPaso1() : validarPaso2();
    if (valido) setPaso((actual) => Math.min(actual + 1, PASOS.length));
  };

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!validarPaso3()) return;

    setEnviando(true);
    setErrorFormulario(null);
    try {
      const resultado = await completarSetup({
        organizacionNombre: formulario.organizacionNombre.trim(),
        qlikTenantHost: formulario.qlikTenantHost.trim(),
        qlikClientId: formulario.qlikClientId.trim(),
        qlikClientSecret: formulario.qlikClientSecret.trim(),
        qlikScopes: formulario.qlikScopes,
        superadminNombre: formulario.superadminNombre.trim(),
        superadminCorreo: formulario.superadminCorreo.trim().toLowerCase(),
        frontendUrl: window.location.origin,
      } satisfies EntradaSetup);

      if (!resultado.organizacionId || !resultado.tenantQlikId) {
        throw new Error(
          "La respuesta del servidor no contiene la configuración creada.",
        );
      }
      mostrarExito("Configuración inicial guardada.");
      window.location.assign("/login");
    } catch (causa) {
      const mensaje =
        causa instanceof Error
          ? causa.message
          : "No se pudo guardar la configuración.";
      setErrorFormulario(mensaje);
      mostrarError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  const alternarScope = (scope: string) => {
    actualizarCampo(
      "qlikScopes",
      formulario.qlikScopes.includes(scope)
        ? formulario.qlikScopes.filter((actual) => actual !== scope)
        : [...formulario.qlikScopes, scope],
    );
  };

  const copiarRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(formulario.qlikRedirectUri);
      mostrarExito("URI de redirección copiada");
    } catch {
      mostrarError("No se pudo copiar la URI de redirección");
    }
  };

  return (
    <main className="min-h-screen bg-app px-4 py-8 sm:px-6 sm:py-12">
      <Card className="mx-auto w-full max-w-2xl border-line-200 shadow-sm">
        <CardHeader className="space-y-5 border-line-200 px-5 py-5 sm:px-8 sm:py-7">
          <div className="flex items-start gap-3">
            <Icon name="gear" size="md" className="mt-0.5 text-brand-700" />
            <div>
              <CardTitle className="text-xl text-ink-900">
                Configuración inicial
              </CardTitle>
              <p className="mt-1 text-sm text-ink-600">
                Registra la empresa, las credenciales de Qlik Cloud y el acceso
                administrador.
              </p>
            </div>
          </div>

          <div
            aria-label={`Paso ${paso} de ${PASOS.length}`}
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-xs font-medium text-ink-600">
              <span>Progreso</span>
              <span>
                {paso} de {PASOS.length}
              </span>
            </div>
            <div
              aria-valuemax={PASOS.length}
              aria-valuemin={1}
              aria-valuenow={paso}
              aria-valuetext={`Paso ${paso} de ${PASOS.length}: ${PASOS[paso - 1].titulo}`}
              className="h-2 overflow-hidden rounded-sm bg-line-200"
              role="progressbar"
              tabIndex={0}
            >
              <div
                className="h-full bg-brand-600 transition-[width]"
                style={{ width: `${(paso / PASOS.length) * 100}%` }}
              />
            </div>
            <ol
              className="grid grid-cols-3 gap-2"
              aria-label="Pasos de configuración"
            >
              {PASOS.map((item) => (
                <li
                  key={item.numero}
                  aria-current={paso === item.numero ? "step" : undefined}
                  className={
                    paso === item.numero ? "text-ink-900" : "text-ink-500"
                  }
                >
                  <span className="block text-xs font-semibold">
                    {item.numero}. {item.titulo}
                  </span>
                  <span className="hidden text-xs sm:block">
                    {item.descripcion}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </CardHeader>

        <CardContent className="px-5 py-6 sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {errorFormulario && (
              <div
                role="alert"
                className="border-l-4 border-danger-600 bg-danger-50 px-3 py-2 text-sm text-danger-800"
              >
                {errorFormulario}
              </div>
            )}

            {paso === 1 && (
              <Paso1Empresa
                formulario={formulario}
                actualizarCampo={actualizarCampo}
              />
            )}

            {paso === 2 && (
              <Paso2QlikCloud
                formulario={formulario}
                actualizarCampo={actualizarCampo}
                alternarScope={alternarScope}
                copiarRedirectUri={copiarRedirectUri}
              />
            )}

            {paso === 3 && (
              <Paso3Admin
                formulario={formulario}
                actualizarCampo={actualizarCampo}
              />
            )}

            <div className="flex items-center justify-between border-t border-line-200 pt-5">
              {paso > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPaso((actual) => Math.max(actual - 1, 1))}
                  disabled={enviando}
                >
                  Anterior
                </Button>
              ) : (
                <span />
              )}

              {paso < PASOS.length ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSiguiente}
                >
                  Siguiente
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={enviando}>
                  {enviando ? "Guardando…" : "Completar configuración"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
