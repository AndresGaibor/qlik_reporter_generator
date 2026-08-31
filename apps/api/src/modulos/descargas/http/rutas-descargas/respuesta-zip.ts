import { Readable } from "node:stream";
import type { ZipArchive } from "archiver";

export function respuestaZipEjecucion(zip: ZipArchive, nombreReporte: string) {
  return new Response(Readable.toWeb(zip as Readable) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nombreReporte.replace(/[^a-zA-Z0-9._-]/g, "_") || "reporte"}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
