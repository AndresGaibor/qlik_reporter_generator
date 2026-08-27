import { crearAplicacion } from "../app.js";
import { cargarConfiguracion } from "../plataforma/configuracion/entorno.js";
import { cerrarConexion } from "../plataforma/persistencia/conexion.js";

const configuracion = cargarConfiguracion();

const app = await crearAplicacion({ configuracion });
const puerto = configuracion.PORT;

const servidor = Bun.serve({
  fetch: app.fetch,
  port: puerto,
  // Las integraciones con Qlik/GCS pueden tardar más que el valor por defecto
  // de Bun. Las descargas grandes responden por streaming y mantienen actividad.
  idleTimeout: 60,
});

console.log(`\n🚀 API en http://localhost:${puerto}\n`);

let cerrando = false;
async function cerrarOrdenadamente(senal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  console.info("\n👋 Cerrando API...");
  servidor.stop();
  await cerrarConexion();
  process.exit(0);
}

process.once("SIGTERM", () => void cerrarOrdenadamente("SIGTERM"));
process.once("SIGINT", () => void cerrarOrdenadamente("SIGINT"));
