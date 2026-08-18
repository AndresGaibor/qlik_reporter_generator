import { EstadoCarga } from "@/compartido/componentes/ui/estado-carga";
import { Icon } from "@/compartido/componentes/ui/icon";
import { PageHeader } from "@/compartido/componentes/ui/page-header";
import { PageLayout } from "@/compartido/componentes/ui/page-layout";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  type ConfiguracionBigQuery,
  type ConfiguracionOauthQlik,
  type DetalleTenant,
  type TenantQlik,
  obtenerConfiguracionBigQuery,
  obtenerConfiguracionOauthTenant,
  obtenerDetalleTenant,
  obtenerTenantsQlik,
} from "./api";
import { NavegacionConfiguracion } from "./componentes/navegacion-configuracion";
import { ResumenConfiguracion } from "./componentes/resumen-configuracion";
import { SeccionAutomatizacionBaseTenant } from "./componentes/seccion-automatizacion-base-tenant";
import { SeccionBigQuery } from "./componentes/seccion-bigquery";
import { SeccionDataflowBaseTenant } from "./componentes/seccion-dataflow-base-tenant";
import { SeccionInfoTenant } from "./componentes/seccion-info-tenant";
import { SeccionOauthQlik } from "./componentes/seccion-oauth-qlik";
import { SeccionQlikCloud } from "./componentes/seccion-qlik-cloud";
import { SeccionUsuarios } from "./componentes/seccion-usuarios";
import { useDetalleTenantMutations } from "./hooks/useDetalleTenantMutations";
import { crearResumenConfiguracion } from "./utiles-estado-configuracion";

interface Props {
  tenantId: string;
  modoConfiguracion?: boolean;
}

function EstadoConfiguracion({ tenant }: { tenant: DetalleTenant }) {
  const activa = tenant.estado === "activa";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        activa
          ? "border-brand-100 bg-brand-50 text-brand-700"
          : "border-red-100 bg-red-50 text-danger-600"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          activa ? "bg-brand-600 animate-dot-pulse" : "bg-danger-600"
        }`}
      />
      {activa ? "Activa" : "Suspendida"}
    </span>
  );
}

function SeccionAnclada({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      {children}
    </section>
  );
}

export function PaginaDetalleTenant({
  tenantId,
  modoConfiguracion = false,
}: Props) {
  const [modalUsuario, setModalUsuario] = useState(false);
  const [correoUsuario, setCorreoUsuario] = useState("");
  const [rolUsuario, setRolUsuario] = useState<"admin" | "usuario">("usuario");

  const { data: tenant, isLoading } = useQuery<DetalleTenant>({
    queryKey: ["admin-tenant", tenantId],
    queryFn: () => obtenerDetalleTenant(tenantId),
  });

  const { data: tenantsQlik = [] } = useQuery<TenantQlik[]>({
    queryKey: ["admin-tenants-qlik", tenantId],
    queryFn: () => obtenerTenantsQlik(tenantId),
  });

  const tenantQlikPrincipal =
    tenantsQlik.find((item) => item.esPrincipal) ?? tenantsQlik[0];

  const oauthPrincipal = useQuery<ConfiguracionOauthQlik>({
    queryKey: ["admin-oauth-qlik", tenantId, tenantQlikPrincipal?.id],
    queryFn: () =>
      obtenerConfiguracionOauthTenant(tenantId, tenantQlikPrincipal?.id ?? ""),
    enabled: Boolean(tenantQlikPrincipal?.id),
    retry: false,
  });

  const bigQueryPrincipal = useQuery<ConfiguracionBigQuery>({
    queryKey: ["admin-bigquery", tenantId, tenantQlikPrincipal?.id],
    queryFn: () =>
      obtenerConfiguracionBigQuery(tenantId, tenantQlikPrincipal?.id ?? ""),
    enabled: Boolean(tenantQlikPrincipal?.id),
    retry: false,
  });

  const {
    actualizar,
    agregarUsuario,
    actualizarUsuario,
    eliminarUsuario,
    crearQlik,
    hacerPrincipal,
    eliminarQlik,
  } = useDetalleTenantMutations({
    tenantId,
    correoUsuario,
    rolUsuario,
    onLimpiarFormularioUsuario: () => {
      setModalUsuario(false);
      setCorreoUsuario("");
      setRolUsuario("usuario");
    },
  });

  if (isLoading) {
    return <EstadoCarga mensaje="Cargando configuración del entorno..." />;
  }

  if (!tenant) {
    return (
      <div className="py-12 text-center text-danger-600">
        Configuración no encontrada
      </div>
    );
  }

  const resumen = crearResumenConfiguracion({
    empresaActiva: tenant.estado === "activa",
    cantidadUsuarios: tenant.usuarios.length,
    qlik: {
      conectado: tenantQlikPrincipal?.estado === "activo",
      host: tenantQlikPrincipal?.host,
    },
    oauth: { estado: oauthPrincipal.data?.estado },
    plantilla: {
      configurada: Boolean(tenantQlikPrincipal?.automatizacionBaseIdQlik),
      nombre: tenantQlikPrincipal?.automatizacionBaseNombre,
    },
    bigQuery: {
      estado: bigQueryPrincipal.data?.estado,
      dataset: bigQueryPrincipal.data?.dataset,
    },
  });

  return (
    <PageLayout>
      {modoConfiguracion ? (
        <PageHeader
          title="Configuración"
          description="Administra Qlik Cloud, BigQuery, el acceso OAuth, la automatización base y los usuarios autorizados."
          actions={<EstadoConfiguracion tenant={tenant} />}
        />
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <Link
              to="/configuracion"
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
            >
              <Icon name="chev" size="sm" className="rotate-180" />
              Configuración
            </Link>
            <EstadoConfiguracion tenant={tenant} />
          </div>
          <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ink-900">
            {tenant.nombre}
          </h1>
        </>
      )}

      <ResumenConfiguracion items={resumen} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <NavegacionConfiguracion items={resumen} />
        </aside>

        <div className="min-w-0 space-y-6">
          <SeccionAnclada id="general">
            <SeccionInfoTenant
              tenant={tenant}
              onActualizarEstado={(estado) => actualizar.mutate({ estado })}
              onActualizarNombre={(nombre) => actualizar.mutate({ nombre })}
              actualizar={actualizar}
            />
          </SeccionAnclada>

          <SeccionAnclada id="qlik">
            <SeccionQlikCloud
              tenant={{ id: tenant.id }}
              tenantsQlik={tenantsQlik}
              onCrear={(params) => crearQlik.mutate(params)}
              onEliminar={(id) => eliminarQlik.mutate(id)}
              onHacerPrincipal={(id) => hacerPrincipal.mutate(id)}
              crear={crearQlik}
              eliminar={eliminarQlik}
              hacerPrincipal={hacerPrincipal}
            />
          </SeccionAnclada>

          <SeccionAnclada id="oauth">
            <SeccionOauthQlik
              organizacionId={tenantId}
              tenantsQlik={tenantsQlik}
            />
          </SeccionAnclada>

          <SeccionAnclada id="plantilla">
            <SeccionAutomatizacionBaseTenant
              organizacionId={tenantId}
              tenantsQlik={tenantsQlik}
            />
          </SeccionAnclada>

          <SeccionDataflowBaseTenant
            organizacionId={tenantId}
            tenantsQlik={tenantsQlik}
          />

          <SeccionAnclada id="bigquery">
            <SeccionBigQuery
              organizacionId={tenantId}
              tenantQlikId={tenantQlikPrincipal?.id}
            />
          </SeccionAnclada>

          <SeccionAnclada id="usuarios">
            <SeccionUsuarios
              usuarios={tenant.usuarios}
              onActualizarRol={(params) => actualizarUsuario.mutate(params)}
              onEliminarUsuario={(id) => eliminarUsuario.mutate(id)}
              onAbrirModalAgregar={() => setModalUsuario(true)}
              modalAgregar={{
                open: modalUsuario,
                onClose: () => setModalUsuario(false),
                onAgregar: (correo, rol) => {
                  setCorreoUsuario(correo);
                  setRolUsuario(rol);
                  agregarUsuario.mutate();
                },
                isPending: agregarUsuario.isPending,
              }}
              actualizar={actualizarUsuario}
              eliminar={eliminarUsuario}
            />
          </SeccionAnclada>
        </div>
      </div>
    </PageLayout>
  );
}
