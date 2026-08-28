import type { ResumenReporte } from "@qlik/contratos";

export function filtrarReportes(
  reportes: ResumenReporte[],
  busqueda: string,
  espacioId: string,
) {
  const termino = busqueda.trim().toLocaleLowerCase();
  return reportes.filter((reporte) => {
    const coincideBusqueda =
      !termino ||
      [reporte.nombre, reporte.espacioNombre ?? ""].some((valor) =>
        valor.toLocaleLowerCase().includes(termino),
      );
    return coincideBusqueda && (!espacioId || reporte.espacioId === espacioId);
  });
}
