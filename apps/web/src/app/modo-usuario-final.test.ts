import { afterEach, expect, test } from "vitest";
import {
  COOKIE_MODO_USUARIO_FINAL,
  leerModoUsuarioFinal,
  persistirModoUsuarioFinal,
} from "./modo-usuario-final";

afterEach(() => {
  window.sessionStorage.clear();
  document.cookie = `${COOKIE_MODO_USUARIO_FINAL}=; Max-Age=0; Path=/`;
});

test("persiste el preview en sesión y cookie para que el backend reduzca privilegios", () => {
  persistirModoUsuarioFinal(true);

  expect(leerModoUsuarioFinal()).toBe(true);
  expect(window.sessionStorage.getItem("qlik-report:modo-usuario-final")).toBe("1");
  expect(document.cookie).toContain(`${COOKIE_MODO_USUARIO_FINAL}=1`);
});

test("al salir del preview elimina la señal de backend", () => {
  persistirModoUsuarioFinal(true);
  persistirModoUsuarioFinal(false);

  expect(leerModoUsuarioFinal()).toBe(false);
  expect(window.sessionStorage.getItem("qlik-report:modo-usuario-final")).toBe("0");
  expect(document.cookie).not.toContain(`${COOKIE_MODO_USUARIO_FINAL}=1`);
});
