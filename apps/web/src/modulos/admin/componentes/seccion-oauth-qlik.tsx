import { useNotificaciones } from "@/compartido/componentes/feedback/notificaciones";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import { iniciarVerificacionOauth } from "@/modulos/autenticacion/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TenantQlik } from "../api";
import {
  guardarConfiguracionOauthTenant,
  obtenerConfiguracionOauthTenant,
} from "../api";
import { FormularioOauthTenant } from "./formulario-oauth-tenant";
import { normalizarScopesOauth, puedeGuardarOauth } from "./oauth-formulario";
import { ResumenOauth } from "./resumen-oauth";

const SCOPES_RECOMENDADOS = [
  "user_default",
  "offline_access",
  "identity.name:read",
  "identity.email:read",
  "identity.subject:read",
  "identity.picture:read",
  "automations",
  "automations.private",
  "automations.shared",
  "spaces:read",
  "apps:read",
  "data-integration",
];

interface Props {
  organizacionId: string;
  tenantsQlik: TenantQlik[];
}

export function SeccionOauthQlik({ organizacionId, tenantsQlik }: Props) {
  const queryClient = useQueryClient();
  const { mostrarError, mostrarExito } = useNotificaciones();

  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const verificado = parametros.get("oauth_verificado");
    const error = parametros.get("oauth_error");
    if (!verificado && !error) return;

    if (verificado) {
      mostrarExito("Conexión OAuth con Qlik verificada");
      queryClient.invalidateQueries({ queryKey: ["admin-oauth-qlik"] });
    } else if (error) {
      mostrarError("No se pudo verificar la conexión OAuth con Qlik");
    }
    history.replaceState(null, "", window.location.pathname);
  }, [mostrarError, mostrarExito, queryClient]);

  if (tenantsQlik.length === 0) return null;

  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon name="gear" className="text-obj-600" />
          Acceso OAuth de Qlik
        </CardTitle>
        <p className="mt-1 text-xs text-ink-500">
          Cada entorno Qlik utiliza su propio cliente OAuth. El secreto se cifra
          antes de guardarse y nunca vuelve a mostrarse.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {tenantsQlik.map((tenant) => (
          <TarjetaOauthTenant
            key={tenant.id}
            organizacionId={organizacionId}
            tenant={tenant}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TarjetaOauthTenant({
  organizacionId,
  tenant,
}: {
  organizacionId: string;
  tenant: TenantQlik;
}) {
  const queryClient = useQueryClient();
  const { mostrarError, mostrarExito } = useNotificaciones();
  const [editando, setEditando] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [clienteSecreto, setClienteSecreto] = useState("");
  const [scopesTexto, setScopesTexto] = useState(
    SCOPES_RECOMENDADOS.join("\n"),
  );

  const consulta = useQuery({
    queryKey: ["admin-oauth-qlik", organizacionId, tenant.id],
    queryFn: () => obtenerConfiguracionOauthTenant(organizacionId, tenant.id),
  });

  useEffect(() => {
    if (!consulta.data) return;
    setClienteId(consulta.data.clienteId ?? "");
    setScopesTexto(
      (consulta.data.scopes.length
        ? consulta.data.scopes
        : SCOPES_RECOMENDADOS
      ).join("\n"),
    );
  }, [consulta.data]);

  const guardar = useMutation({
    mutationFn: async (conectar: boolean) => {
      const scopes = normalizarScopesOauth(scopesTexto);
      const existeConfiguracionPropia = consulta.data?.origen === "tenant";
      if (
        !puedeGuardarOauth({
          clienteId,
          scopes,
          clienteSecreto,
          existeConfiguracionPropia,
        })
      ) {
        throw new Error(
          existeConfiguracionPropia
            ? "Ingresa el Client ID y al menos un scope OAuth"
            : "La primera configuración requiere Client ID, scopes y secreto",
        );
      }

      const configuracion = await guardarConfiguracionOauthTenant(
        organizacionId,
        tenant.id,
        {
          clienteId: clienteId.trim(),
          ...(clienteSecreto ? { clienteSecreto } : {}),
          scopes,
        },
      );
      setClienteSecreto("");

      if (conectar) {
        const retorno = "/configuracion";
        const inicio = await iniciarVerificacionOauth(tenant.host, retorno);
        if (!inicio.exito || !inicio.datos?.url) {
          throw new Error(
            inicio.error?.mensaje ?? "No se pudo iniciar la verificación OAuth",
          );
        }
        window.location.href = inicio.datos.url;
      }
      return configuracion;
    },
    onSuccess: (_configuracion, conectar) => {
      setClienteSecreto("");
      queryClient.invalidateQueries({
        queryKey: ["admin-oauth-qlik", organizacionId, tenant.id],
      });
      if (!conectar) {
        setEditando(false);
        mostrarExito("Configuración OAuth guardada");
      }
    },
    onError: (err: Error) => {
      mostrarError(err.message);
    },
  });

  const scopes = normalizarScopesOauth(scopesTexto);
  const existeConfiguracionPropia = consulta.data?.origen === "tenant";
  const habilitado = puedeGuardarOauth({
    clienteId,
    scopes,
    clienteSecreto,
    existeConfiguracionPropia,
  });

  const configurada =
    consulta.data?.origen === "tenant" && Boolean(consulta.data.clienteId);

  if (configurada && consulta.data && !editando) {
    return (
      <ResumenOauth
        tenant={tenant}
        configuracion={consulta.data}
        verificando={guardar.isPending}
        onEditar={() => setEditando(true)}
        onVerificar={() => guardar.mutate(true)}
      />
    );
  }

  return (
    <FormularioOauthTenant
      tenant={tenant}
      configuracion={consulta.data}
      cargando={consulta.isLoading}
      clienteId={clienteId}
      clienteSecreto={clienteSecreto}
      scopesTexto={scopesTexto}
      habilitado={habilitado}
      guardando={guardar.isPending}
      onClienteId={setClienteId}
      onClienteSecreto={setClienteSecreto}
      onScopesTexto={setScopesTexto}
      onGuardar={(conectar) => guardar.mutate(conectar)}
      onCancelar={configurada ? () => setEditando(false) : undefined}
      onCopiar={async () => {
        const redirectUri = consulta.data?.redirectUri;
        if (!redirectUri) return;
        await navigator.clipboard.writeText(redirectUri);
        mostrarExito("URL de redirección copiada");
      }}
    />
  );
}
