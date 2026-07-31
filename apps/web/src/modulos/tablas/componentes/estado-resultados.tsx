import { Button } from "@/compartido/componentes/ui/button";
import { Icon, type IconName } from "@/compartido/componentes/ui/icon";

type TipoEstado =
  | "sin-conexion"
  | "conexion-error"
  | "catalogo-error"
  | "sin-seleccion";

interface Props {
  tipo: TipoEstado;
  mensaje?: string;
  onReintentar?: () => void;
}

const COPIA: Record<
  TipoEstado,
  { icono: IconName; titulo: string; descripcion: string }
> = {
  "sin-conexion": {
    icono: "cloud",
    titulo: "Configura BigQuery para ver resultados",
    descripcion:
      "Agrega la cuenta de servicio y el dataset desde Configuración. Después podrás explorar sus tablas aquí.",
  },
  "conexion-error": {
    icono: "x",
    titulo: "BigQuery necesita atención",
    descripcion:
      "La configuración existe, pero la conexión no está disponible. Revisa las credenciales o prueba nuevamente.",
  },
  "catalogo-error": {
    icono: "x",
    titulo: "No pudimos cargar las tablas",
    descripcion:
      "BigQuery respondió con un error al consultar el catálogo. Puedes volver a intentarlo.",
  },
  "sin-seleccion": {
    icono: "db",
    titulo: "Selecciona una tabla",
    descripcion:
      "Elige una tabla del catálogo para revisar sus campos y una vista previa de los datos.",
  },
};

export function EstadoResultados({ tipo, mensaje, onReintentar }: Props) {
  const copia = COPIA[tipo];
  const esError = tipo === "conexion-error" || tipo === "catalogo-error";

  return (
    <section
      className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-line-300 bg-surface px-6 py-12 text-center"
      role={esError ? "alert" : "status"}
    >
      <span
        className={`grid h-14 w-14 place-items-center rounded-full ${
          esError ? "bg-red-50 text-danger-600" : "bg-brand-50 text-brand-600"
        }`}
      >
        <Icon name={copia.icono} size="lg" />
      </span>
      <h2 className="mt-4 font-display text-lg font-semibold text-ink-900">
        {copia.titulo}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-500">
        {mensaje || copia.descripcion}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {tipo === "sin-conexion" || tipo === "conexion-error" ? (
          <Button asChild>
            <a href="/configuracion">Configura BigQuery</a>
          </Button>
        ) : null}
        {onReintentar && (
          <Button variant="outline" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
      </div>
    </section>
  );
}
