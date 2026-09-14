export const CLAVE_MODO_USUARIO_FINAL = "qlik-report:modo-usuario-final";
export const COOKIE_MODO_USUARIO_FINAL = "qlik_vista_usuario_final";

export function leerModoUsuarioFinal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(CLAVE_MODO_USUARIO_FINAL) === "1";
  } catch {
    return false;
  }
}

export function persistirModoUsuarioFinal(activo: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CLAVE_MODO_USUARIO_FINAL, activo ? "1" : "0");
  } catch {
    // El modo sigue funcionando en memoria si sessionStorage está bloqueado.
  }
  try {
    document.cookie = activo
      ? `${COOKIE_MODO_USUARIO_FINAL}=1; Path=/; SameSite=Lax`
      : `${COOKIE_MODO_USUARIO_FINAL}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // La cookie solo reduce privilegios; si está bloqueada, la UI sigue protegida.
  }
}
