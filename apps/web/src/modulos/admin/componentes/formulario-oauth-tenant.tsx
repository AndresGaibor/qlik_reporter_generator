import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { useState } from "react";
import type { ConfiguracionOauthQlik, TenantQlik } from "../api";
import { normalizarScopesOauth } from "./oauth-formulario";

export interface FormularioOauthTenantProps {
  tenant: TenantQlik;
  configuracion?: ConfiguracionOauthQlik;
  cargando: boolean;
  clienteId: string;
  clienteSecreto: string;
  scopesTexto: string;
  habilitado: boolean;
  guardando: boolean;
  onClienteId: (valor: string) => void;
  onClienteSecreto: (valor: string) => void;
  onScopesTexto: (valor: string) => void;
  onGuardar: (conectar: boolean) => void;
  onCancelar?: () => void;
  onCopiar: () => void;
}

export function FormularioOauthTenant({
  tenant,
  configuracion,
  cargando,
  clienteId,
  clienteSecreto,
  scopesTexto,
  habilitado,
  guardando,
  onClienteId,
  onClienteSecreto,
  onScopesTexto,
  onGuardar,
  onCancelar,
  onCopiar,
}: FormularioOauthTenantProps) {
  const [mostrarInstrucciones, setMostrarInstrucciones] = useState(false);
  const [mostrarScopes, setMostrarScopes] = useState(false);

  return (
    <section className="rounded-xl border border-line-200 bg-app/20 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-ink-900">
            {tenant.nombre || "Tenant Qlik"}
          </h3>
          <p className="font-mono text-xs text-ink-500">{tenant.host}</p>
        </div>
        <EstadoOauth configuracion={configuracion} cargando={cargando} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-line-200 bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-ink-900">
                Configuración en Qlik Cloud
              </h4>
              <p className="mt-1 text-xs text-ink-500">
                Copia la URL de redirección en el cliente OAuth de tipo Web.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={mostrarInstrucciones}
              onClick={() => setMostrarInstrucciones((actual) => !actual)}
            >
              {mostrarInstrucciones
                ? "Ocultar instrucciones"
                : "Ver instrucciones"}
            </Button>
          </div>

          {mostrarInstrucciones && (
            <ol className="mt-4 list-decimal space-y-2 border-t border-line-200 pt-4 pl-5 text-xs leading-5 text-ink-600">
              <li>Abre Administration y entra en la sección OAuth.</li>
              <li>Crea un cliente nuevo de tipo Web.</li>
              <li>Copia exactamente la URL de redirección.</li>
              <li>Usa los permisos recomendados por la plataforma.</li>
              <li>Copia el Client ID y el secreto antes de cerrar Qlik.</li>
            </ol>
          )}

          <label
            htmlFor={`oauth-redirect-${tenant.id}`}
            className="mt-4 block text-xs font-semibold text-ink-700"
          >
            URL de redirección
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id={`oauth-redirect-${tenant.id}`}
              readOnly
              value={configuracion?.redirectUri ?? "Cargando…"}
              className="min-w-0 flex-1 rounded-md border border-line-200 bg-app px-3 py-2 font-mono text-xs text-ink-700"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!configuracion?.redirectUri}
              onClick={onCopiar}
              className="gap-1"
            >
              <Icon name="copy" size="sm" />
              Copiar URL
            </Button>
          </div>
        </div>
        <div className="space-y-4">
          {configuracion?.origen === "entorno_global" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Este tenant todavía usa las credenciales globales del servidor.
              Guarda una configuración propia para independizarlo.
            </div>
          )}

          <div>
            <label
              htmlFor={`oauth-cliente-${tenant.id}`}
              className="block text-xs font-semibold text-ink-700"
            >
              Client ID
            </label>
            <input
              id={`oauth-cliente-${tenant.id}`}
              value={clienteId}
              onChange={(evento) => onClienteId(evento.target.value)}
              placeholder="Client ID generado por Qlik"
              className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor={`oauth-secreto-${tenant.id}`}
              className="block text-xs font-semibold text-ink-700"
            >
              Client Secret
            </label>
            <input
              id={`oauth-secreto-${tenant.id}`}
              type="password"
              autoComplete="new-password"
              value={clienteSecreto}
              onChange={(evento) => onClienteSecreto(evento.target.value)}
              placeholder={
                configuracion?.origen === "tenant"
                  ? `Conservado como ${configuracion.secretoMascara ?? "secreto cifrado"}`
                  : "Pega aquí el secreto generado por Qlik"
              }
              className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-500">
              Déjalo vacío al editar para conservar el secreto actual.
            </p>
          </div>
          <div className="rounded-lg border border-line-200 bg-app/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-700">
                  Permisos OAuth recomendados
                </p>
                <p className="mt-1 text-[11px] text-ink-500">
                  {normalizarScopesOauth(scopesTexto).length} permisos
                  configurados.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={mostrarScopes}
                onClick={() => setMostrarScopes((actual) => !actual)}
              >
                {mostrarScopes ? "Ocultar avanzado" : "Editar avanzado"}
              </Button>
            </div>
            {mostrarScopes && (
              <div className="mt-3 border-t border-line-200 pt-3">
                <label
                  htmlFor={`oauth-scopes-${tenant.id}`}
                  className="block text-xs font-semibold text-ink-700"
                >
                  Scopes OAuth
                </label>
                <textarea
                  id={`oauth-scopes-${tenant.id}`}
                  rows={7}
                  value={scopesTexto}
                  onChange={(evento) => onScopesTexto(evento.target.value)}
                  className="mt-1 w-full rounded-md border border-line-200 bg-surface px-3 py-2 font-mono text-xs text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Modifica esta lista solo cuando Qlik requiera permisos
                  distintos.
                </p>
              </div>
            )}
          </div>

          {configuracion?.ultimoError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Último error: {configuracion.ultimoError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-line-200 pt-4 sm:flex-row sm:justify-end">
            {onCancelar && (
              <Button
                type="button"
                variant="ghost"
                disabled={guardando}
                onClick={onCancelar}
              >
                Cancelar
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!habilitado || guardando}
              onClick={() => onGuardar(false)}
            >
              Guardar sin verificar
            </Button>
            <Button
              type="button"
              disabled={!habilitado || guardando}
              onClick={() => onGuardar(true)}
              className="gap-1.5"
            >
              <Icon name="play" size="sm" />
              {guardando ? "Guardando…" : "Guardar y verificar"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EstadoOauth({
  configuracion,
  cargando,
}: {
  configuracion?: ConfiguracionOauthQlik;
  cargando: boolean;
}) {
  if (cargando) {
    return (
      <span className="rounded-full border border-line-200 bg-surface px-2.5 py-1 text-xs text-ink-500">
        Consultando…
      </span>
    );
  }

  const origen = configuracion?.origen ?? "sin_configurar";
  const estado = configuracion?.estado;
  const estilos =
    estado === "verificada"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : estado === "error"
        ? "border-red-200 bg-red-50 text-red-700"
        : origen === "entorno_global"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-line-200 bg-surface text-ink-600";
  const texto =
    estado === "verificada"
      ? "Verificada"
      : estado === "error"
        ? "Con error"
        : estado === "pendiente"
          ? "Pendiente de verificar"
          : estado === "desactivada"
            ? "Desactivada"
            : origen === "entorno_global"
              ? "Configuración heredada"
              : "Sin configurar";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${estilos}`}
    >
      {texto}
    </span>
  );
}
