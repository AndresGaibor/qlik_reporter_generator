import { Button } from "@/compartido/componentes/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/compartido/componentes/ui/card";
import { Icon } from "@/compartido/componentes/ui/icon";
import type { TenantQlik } from "@/modulos/admin/api";
import { useState } from "react";
import { ResumenPlantillaBase } from "./resumen-plantilla-base";
import { SeccionConfigurarAutomatizacionBase } from "./seccion-configurar-automatizacion-base";

interface Props {
  organizacionId: string;
  tenantsQlik: TenantQlik[];
}

export function SeccionAutomatizacionBaseTenant({
  organizacionId,
  tenantsQlik,
}: Props) {
  if (tenantsQlik.length === 0) return null;
  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon name="robot" className="text-brand-600" />
          Plantilla base de automatizaciones
        </CardTitle>
        <p className="mt-1 text-xs text-ink-500">
          Define la automatización que se copiará al crear cada reporte.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {tenantsQlik.map((tenantQlik) => (
          <PlantillaPorEntorno
            key={tenantQlik.id}
            organizacionId={organizacionId}
            tenantQlik={tenantQlik}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PlantillaPorEntorno({
  organizacionId,
  tenantQlik,
}: { organizacionId: string; tenantQlik: TenantQlik }) {
  const configurada = Boolean(tenantQlik.automatizacionBaseIdQlik);
  const [editando, setEditando] = useState(!configurada);

  if (configurada && !editando) {
    return (
      <ResumenPlantillaBase
        nombre={tenantQlik.automatizacionBaseNombre || "Plantilla base"}
        entorno={tenantQlik.nombre || "Entorno Qlik Cloud"}
        host={tenantQlik.host}
        onCambiar={() => setEditando(true)}
      />
    );
  }

  return (
    <section className="rounded-xl border border-line-200 bg-app/20 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {tenantQlik.nombre || "Entorno Qlik Cloud"}
          </p>
          <p className="font-mono text-xs text-ink-500">{tenantQlik.host}</p>
        </div>
        {configurada && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        )}
      </div>
      {!configurada && (
        <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs leading-5 text-brand-800">
          El sistema copiará esta automatización y personalizará la copia sin
          modificar el original.
        </div>
      )}
      <SeccionConfigurarAutomatizacionBase
        organizacionId={organizacionId}
        tenantQlik={tenantQlik}
      />
    </section>
  );
}
