import { expect, test } from "bun:test";

test("no deja nombres de automatización legacy en código productivo", async () => {
  const rutas = [
    "apps/api/src/plataforma/persistencia/esquema.ts",
    "apps/api/src/modulos/reportes",
    "apps/api/src/modulos/admin",
  ];
  const prohibido = ["automatizacion", "NombreSnapshot"].join("");
  const archivos = await Bun.$`rg -l ${prohibido} ${rutas} || true`.text();
  expect(archivos.trim()).toBe("");
});
