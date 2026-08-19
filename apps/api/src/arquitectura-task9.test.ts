import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function archivos(ruta: string): Promise<string[]> {
  const entradas = await readdir(ruta, { withFileTypes: true });
  const resultado: string[] = [];
  for (const entrada of entradas) {
    const path = join(ruta, entrada.name);
    if (entrada.isDirectory()) resultado.push(...(await archivos(path)));
    else if (
      /\.(ts|tsx)$/.test(entrada.name) &&
      !entrada.name.includes(".test.")
    )
      resultado.push(path);
  }
  return resultado;
}

describe("guardas de retiro de semántica legacy de Automate por reporte", () => {
  it("deja fuera del código productivo la creación legacy y el stop de Qlik", async () => {
    const raices = [
      join(import.meta.dir, "modulos"),
      join(import.meta.dir, "../../web/src/modulos/reportes"),
      join(import.meta.dir, "../../../packages/contratos/src"),
    ];
    const violaciones: string[] = [];
    for (const raiz of raices) {
      for (const archivo of await archivos(raiz)) {
        const contenido = await Bun.file(archivo).text();
        if (
          /CrearAutomatizacionDesdePlantilla|detenerEjecucion|clonarAutomatizacion/.test(
            contenido,
          )
        ) {
          violaciones.push(archivo);
        }
      }
    }
    expect(violaciones).toEqual([]);
  });

  it("no deja rutas frontend apuntando a superficies HTTP retiradas", async () => {
    const raiz = join(import.meta.dir, "../../web/src");
    const violaciones: string[] = [];
    const rutasRetiradas =
      /\/(?:destinos|tablas)(?:\/|["'`])|\/reportes\/configuracion-tenant/;
    for (const archivo of await archivos(raiz)) {
      const contenido = await Bun.file(archivo).text();
      if (rutasRetiradas.test(contenido)) violaciones.push(archivo);
    }
    expect(violaciones).toEqual([]);
  });
});
