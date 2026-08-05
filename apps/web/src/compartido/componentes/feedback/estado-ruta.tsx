import { Button } from "@/compartido/componentes/ui/button";
import { Icon } from "@/compartido/componentes/ui/icon";
import { Link } from "@tanstack/react-router";

interface EstadoRutaProps {
  tipo: "no-encontrada" | "error";
  onReintentar?: () => void;
}

export function EstadoRuta({ tipo, onReintentar }: EstadoRutaProps) {
  const noEncontrada = tipo === "no-encontrada";

  return (
    <main className="ambient flex min-h-[calc(100vh-4rem)] items-center justify-center bg-app px-4 py-10">
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-line-200 bg-surface px-6 py-10 text-center shadow-panel sm:px-10"
      >
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-700">
          <Icon name={noEncontrada ? "search" : "cloud"} size="lg" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
          {noEncontrada ? "Error 404" : "Algo no salió bien"}
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900">
          {noEncontrada
            ? "No encontramos esta página"
            : "No pudimos cargar esta página"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-500">
          {noEncontrada
            ? "La dirección puede estar escrita incorrectamente o la página ya no existe."
            : "Puede que haya un problema temporal de conexión. Puedes reintentar o volver al inicio."}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          {!noEncontrada && onReintentar && (
            <Button type="button" onClick={onReintentar} className="gap-2">
              <Icon name="rows" size="sm" />
              Reintentar
            </Button>
          )}
          <Button variant="outline" asChild className="gap-2">
            <Link to="/">
              <Icon name="home" size="sm" />
              Ir al inicio
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
