import { Hono } from "hono";
import { registrarRutasCarpeta } from "./rutas-descargas/registrar-carpetas.js";
import { registrarRutasEjecuciones } from "./rutas-descargas/registrar-ejecuciones.js";
import { registrarRutasExplorador } from "./rutas-descargas/registrar-explorador.js";
import type { DependenciasRutasDescargas } from "./rutas-descargas/tipos.js";

export type { DependenciasRutasDescargas } from "./rutas-descargas/tipos.js";

export function crearRutasDescargas(dependencias: DependenciasRutasDescargas) {
  const rutas = new Hono();
  registrarRutasCarpeta(rutas, dependencias);
  registrarRutasExplorador(rutas, dependencias);
  registrarRutasEjecuciones(rutas, dependencias);
  return rutas;
}
