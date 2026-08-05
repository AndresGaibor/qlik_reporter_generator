import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export interface ErrorDescriptivo {
  message: string;
  codigo?: string;
}

export function extraerMensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Ocurrió un error inesperado. Por favor intenta nuevamente.";
}

export const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export function Proveedores({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={clienteConsultas}>
      {children}
    </QueryClientProvider>
  );
}
