import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { useValorDiferido } from "./use-valor-diferido";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});

function Muestra({ valor }: { valor: string }) {
  const diferido = useValorDiferido(valor, 450);
  return <output>{diferido}</output>;
}

test("retrasa el valor durante 450 ms", () => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<Muestra valor="inicial" />));
  act(() => root?.render(<Muestra valor="nuevo" />));
  expect(container.textContent).toBe("inicial");
  act(() => vi.advanceTimersByTime(449));
  expect(container.textContent).toBe("inicial");
  act(() => vi.advanceTimersByTime(1));
  expect(container.textContent).toBe("nuevo");
});