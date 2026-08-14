import { describe, expect, it, vi } from "bun:test";
import { iniciarBucleProgramadorReportes } from "./bucle-programador.js";

describe("iniciarBucleProgramadorReportes", () => {
  it("programa cada 30s y evita barridos solapados", async () => {
    let callback: (() => void) | undefined;
    let resolver: (() => void) | undefined;
    const ejecutarPendientes = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    const clear = vi.fn();
    const bucle = iniciarBucleProgramadorReportes(
      { ejecutarPendientes } as never,
      {
        intervaloMs: 30_000,
        ejecutarAlIniciar: false,
        setIntervalFn: (fn, ms) => {
          callback = fn;
          expect(ms).toBe(30_000);
          return 99 as never;
        },
        clearIntervalFn: clear as never,
      },
    );

    callback?.();
    callback?.();
    await Promise.resolve();
    expect(ejecutarPendientes).toHaveBeenCalledTimes(1);
    resolver?.();
    await Promise.resolve();
    await Promise.resolve();
    callback?.();
    await Promise.resolve();
    expect(ejecutarPendientes).toHaveBeenCalledTimes(2);

    bucle.detener();
    expect(clear).toHaveBeenCalled();
  });
});
