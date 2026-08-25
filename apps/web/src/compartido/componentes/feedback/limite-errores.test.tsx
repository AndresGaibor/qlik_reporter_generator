/// <reference types="vitest" />
/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LimiteErrores } from "./limite-errores";
import {
  notificarErrorNoControlado,
  registrarNotificadorErrores,
} from "@/compartido/errores/normalizar-error";

function ComponenteFallido(): never {
  throw new Error("detalle interno que no debe filtrarse");
}

describe("LimiteErrores", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  it("captura errores de renderizado sin filtrar detalles tecnicos al usuario", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <LimiteErrores>
          <ComponenteFallido />
        </LimiteErrores>,
      );
    });

    const texto = container.textContent ?? "";
    expect(texto).toContain("No pudimos cargar esta página");
    expect(texto).not.toContain("detalle interno que no debe filtrarse");
  });

  it("notifica al observador global con el error capturado", () => {
    const notificar = vi.fn();
    registrarNotificadorErrores(notificar);

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <LimiteErrores>
          <ComponenteFallido />
        </LimiteErrores>,
      );
    });

    expect(notificar).toHaveBeenCalledWith(
      expect.objectContaining({ message: "detalle interno que no debe filtrarse" }),
    );
  });
});

describe("notificarErrorNoControlado", () => {
  it("notifica a los observadores registrados", () => {
    const obs1 = vi.fn();
    const obs2 = vi.fn();
    registrarNotificadorErrores(obs1);
    registrarNotificadorErrores(obs2);

    notificarErrorNoControlado(new Error("fallo en segundo plano"));

    expect(obs1).toHaveBeenCalledOnce();
    expect(obs2).toHaveBeenCalledOnce();
  });
});
