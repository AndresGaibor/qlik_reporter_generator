import { Component, type ReactNode } from "react";
import { Button } from "@/compartido/componentes/ui/button";
import { notificarErrorNoControlado } from "@/compartido/errores/normalizar-error";

interface Props {
  children: ReactNode;
}

interface State {
  error?: unknown;
}

export class LimiteErrores extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {};
    this.reintentar = this.reintentar.bind(this);
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  reintentar(): void {
    this.setState({});
  }

  render(): ReactNode {
    if (this.state.error) {
      notificarErrorNoControlado(this.state.error);
      return (
        <main className="ambient flex min-h-[calc(100vh-4rem)] items-center justify-center bg-app px-4 py-10">
          <section
            role="alert"
            className="w-full max-w-lg rounded-2xl border border-line-200 bg-surface px-6 py-10 text-center shadow-panel sm:px-10"
          >
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-700">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </span>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-brand-700">
              Algo no salió bien
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900">
              No pudimos cargar esta página
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-500">
              Puede que haya un problema temporal. Puedes reintentar o recargar la
              página.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
              <Button type="button" onClick={this.reintentar} className="gap-2">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Reintentar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Recargar página
              </Button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
