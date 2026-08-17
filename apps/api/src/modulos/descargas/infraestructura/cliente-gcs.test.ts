import { describe, expect, test, vi } from "vitest";
import type { Storage, Bucket, File } from "@google-cloud/storage";
import {
  URI_BASE_GCS_REPORTES,
  parsearUriGcsPermitida,
} from "../aplicacion/puerto-almacenamiento-descargas.js";
import { ClienteGcs } from "./cliente-gcs.js";

const BUCKET_PERMITIDO = "bkt_dwh";

interface ArchivoSimulado {
  name: string;
  metadata: { size: string | number };
}

function crearFakeStorage(archivosSimulados: ArchivoSimulado[]) {
  const getFilesMock = vi.fn().mockResolvedValue([archivosSimulados]);

  const bucketMock = vi.fn().mockReturnValue({
    getFiles: getFilesMock,
  } as unknown as Bucket);

  const storageFake = {
    bucket: bucketMock,
  } as unknown as Storage;

  return { storageFake, getFilesMock, bucketMock };
}

describe("parsearUriGcsPermitida", () => {
  test("debe parsear uri gs:// valida dentro del bucket permitido", () => {
    const resultado = parsearUriGcsPermitida(
      "gs://bkt_dwh/POCs/TalendDescargados/ventas/e-1/",
    );
    expect(resultado).toEqual({
      bucket: "bkt_dwh",
      prefijo: "POCs/TalendDescargados/ventas/e-1/",
    });
  });

  test("debe rechazar uri con bucket diferente", () => {
    expect(() => parsearUriGcsPermitida("gs://otro-bucket/x/")).toThrow();
  });

  test("debe rechazar uri con ruta fuera de POCs/TalendDescargados", () => {
    expect(() => parsearUriGcsPermitida("gs://bkt_dwh/otra-ruta/")).toThrow();
  });
});

describe("URI_BASE_GCS_REPORTES", () => {
  test("debe ser gs://bkt_dwh/POCs/TalendDescargados/", () => {
    expect(URI_BASE_GCS_REPORTES).toBe("gs://bkt_dwh/POCs/TalendDescargados/");
  });
});

describe("ClienteGcs con fake Storage", () => {
  test("listar debe usar bucket bkt_dwh y getFiles con prefix", async () => {
    const archivosSimulados: ArchivoSimulado[] = [
      { name: "POCs/TalendDescargados/ventas/e-1/archivo1.csv", metadata: { size: 1024 } },
      { name: "POCs/TalendDescargados/ventas/e-1/archivo2.csv", metadata: { size: 2048 } },
    ];

    const { storageFake, bucketMock, getFilesMock } = crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({ projectId: "test-project", storage: storageFake });

    const prefijo = "POCs/TalendDescargados/ventas/e-1/";
    await clienteGcs.listar(prefijo);

    expect(bucketMock).toHaveBeenCalledWith(BUCKET_PERMITIDO);
    expect(getFilesMock).toHaveBeenCalledWith({ prefix: prefijo });
  });

  test("listar debe filtrar archivos terminados en /", async () => {
    const archivosSimulados: ArchivoSimulado[] = [
      { name: "POCs/TalendDescargados/ventas/e-1/archivo1.csv", metadata: { size: 1024 } },
      { name: "POCs/TalendDescargados/ventas/e-1/archivo2.csv", metadata: { size: 2048 } },
      { name: "POCs/TalendDescargados/ventas/e-1/subdir/", metadata: { size: 0 } },
    ];

    const { storageFake } = crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({ projectId: "test-project", storage: storageFake });

    const resultado = await clienteGcs.listar("POCs/TalendDescargados/ventas/e-1/");

    expect(resultado).toHaveLength(2);
    expect(resultado[0].nombre).toBe("archivo1.csv");
  });

  test("listar debe convertir metadata.size a numero", async () => {
    const archivosSimulados: ArchivoSimulado[] = [
      { name: "POCs/TalendDescargados/ventas/e-1/archivo1.csv", metadata: { size: "1024" } },
    ];

    const { storageFake } = crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({ projectId: "test-project", storage: storageFake });

    const resultado = await clienteGcs.listar("test/");

    expect(resultado).toHaveLength(1);
    expect(typeof resultado[0].tamanoBytes).toBe("number");
    expect(resultado[0].tamanoBytes).toBe(1024);
  });
});
