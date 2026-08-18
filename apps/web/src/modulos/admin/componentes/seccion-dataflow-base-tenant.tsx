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
import {
  nombreVisibleEntornoQlik,
  normalizarHostQlik,
} from "../utiles-presentacion-qlik";
import { ResumenPlantillaBase } from "./resumen-plantilla-base";
import { SeccionConfigurarDataflowBase } from "./seccion-configurar-dataflow-base";

interface Props {
  organizacionId: string;
  tenantsQlik: TenantQlik[];
}

export function SeccionDataflowBaseTenant({
  organizacionId,
  tenantsQlik,
}: Props) {
  if (tenantsQlik.length === 0) return null;
  return (
    <Card className="border-line-200 bg-surface shadow-card">
      <CardHeader className="border-b border-line-200 bg-app/30 pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Icon name="star" className="text-brand-600" />
          Dataflow base
        </CardTitle>
        <p className="mt-1 text-xs text-ink-500">
          Define el Dataflow que se usará como plantilla predeterminada en cada
          entorno.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {tenantsQlik.map((tenantQlik) => (
          <DataflowPorEntorno
            key={tenantQlik.id}
            organizacionId={organizacionId}
            tenantQlik={tenantQlik}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DataflowPorEntorno({
  organizacionId,
  tenantQlik,
}: {
  organizacionId: string;
  tenantQlik: TenantQlik;
}) {
  const configurado = Boolean(tenantQlik.dataflowBaseIdQlik);
  const [editando, setEditando] = useState(!configurado);
  const entorno = nombreVisibleEntornoQlik(tenantQlik);
  const host = normalizarHostQlik(tenantQlik.host);
  if (configurado && !editando) {
    return (
      <ResumenPlantillaBase
        nombre={tenantQlik.dataflowBaseNombre || "Dataflow base"}
        entorno={entorno}
        host={host}
        onCambiar={() => setEditando(true)}
      />
    );
  }
  return (
    <section className="rounded-xl border border-line-200 bg-app/20 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{entorno}</p>
          <p className="font-mono text-xs text-ink-500">{host}</p>
        </div>
        {configurado && (
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </div>
      <SeccionConfigurarDataflowBase
        organizacionId={organizacionId}
        tenantQlik={tenantQlik}
      />
    </section>
  );
}
