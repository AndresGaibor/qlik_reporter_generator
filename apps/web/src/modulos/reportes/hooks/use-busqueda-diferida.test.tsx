import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { useBusquedaDiferida } from "./use-busqueda-diferida";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.useRealTimers();
});

function ComponentePrueba({
  valor,
  onCambiar,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
}) {
  useBusquedaDiferida(valor, onCambiar, 350);
  return null;
}

test("aplica la búsqueda recortada después del retraso", () => {
  vi.useFakeTimers();
  const onCambiar = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ComponentePrueba valor="  clientes  " onCambiar={onCambiar} />,
    );
  });

  act(() => vi.advanceTimersByTime(349));
  expect(onCambiar).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(1));
  expect(onCambiar).toHaveBeenCalledOnce();
  expect(onCambiar).toHaveBeenCalledWith("clientes");
});
