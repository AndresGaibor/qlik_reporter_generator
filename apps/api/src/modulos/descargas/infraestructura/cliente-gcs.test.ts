import type { Bucket, File, Storage } from "@google-cloud/storage";
import { describe, expect, test, vi } from "vitest";
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
  test("listar solo expone partes csv gzip generadas por EXPORT DATA", async () => {
    const { storageFake } = crearFakeStorage([
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz",
        metadata: { size: 1024 },
      },
      {
        name: "POCs/TalendDescargados/ventas/e-1/metadata.json",
        metadata: { size: 10 },
      },
      {
        name: "POCs/TalendDescargados/ventas/e-1/archivo.csv",
        metadata: { size: 20 },
      },
    ]);
    const cliente = new ClienteGcs({
      projectId: "test-project",
      storage: storageFake,
    });

    const resultado = await cliente.listar(
      "POCs/TalendDescargados/ventas/e-1/",
    );

    expect(resultado.map((archivo) => archivo.nombre)).toEqual([
      "parte-001-000000000000.csv.gz",
    ]);
  });

  test("firmar fuerza descarga con el nombre del archivo", async () => {
    const getSignedUrl = vi.fn(async () => ["https://storage.test/signed"]);
    const file = vi.fn(() => ({ getSignedUrl }) as unknown as File);
    const bucket = vi.fn(() => ({ file }) as unknown as Bucket);
    const storage = { bucket } as unknown as Storage;
    const cliente = new ClienteGcs({ projectId: "test-project", storage });
    const objeto =
      "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz";

    await cliente.firmar(objeto, 15);

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "v4",
        action: "read",
        responseDisposition:
          'attachment; filename="parte-001-000000000000.csv.gz"',
      }),
    );
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
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz",
        metadata: { size: 1024 },
      },
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-002-000000000000.csv.gz",
        metadata: { size: 2048 },
      },
    ];

    const { storageFake, bucketMock, getFilesMock } =
      crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({
      projectId: "test-project",
      storage: storageFake,
    });

    const prefijo = "POCs/TalendDescargados/ventas/e-1/";
    await clienteGcs.listar(prefijo);

    expect(bucketMock).toHaveBeenCalledWith(BUCKET_PERMITIDO);
    expect(getFilesMock).toHaveBeenCalledWith({ prefix: prefijo });
  });

  test("listar debe filtrar archivos terminados en /", async () => {
    const archivosSimulados: ArchivoSimulado[] = [
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz",
        metadata: { size: 1024 },
      },
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-002-000000000000.csv.gz",
        metadata: { size: 2048 },
      },
      {
        name: "POCs/TalendDescargados/ventas/e-1/subdir/",
        metadata: { size: 0 },
      },
    ];

    const { storageFake } = crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({
      projectId: "test-project",
      storage: storageFake,
    });

    const resultado = await clienteGcs.listar(
      "POCs/TalendDescargados/ventas/e-1/",
    );

    expect(resultado).toHaveLength(2);
    expect(resultado[0].nombre).toBe("parte-001-000000000000.csv.gz");
  });

  test("listar debe convertir metadata.size a numero", async () => {
    const archivosSimulados: ArchivoSimulado[] = [
      {
        name: "POCs/TalendDescargados/ventas/e-1/parte-001-000000000000.csv.gz",
        metadata: { size: "1024" },
      },
    ];

    const { storageFake } = crearFakeStorage(archivosSimulados);

    const clienteGcs = new ClienteGcs({
      projectId: "test-project",
      storage: storageFake,
    });

    const resultado = await clienteGcs.listar("test/");

    expect(resultado).toHaveLength(1);
    expect(typeof resultado[0].tamanoBytes).toBe("number");
    expect(resultado[0].tamanoBytes).toBe(1024);
  });
  test("estaFinalizada busca únicamente el marcador oculto de la ejecución", async () => {
    const getFilesMock = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            name: "POCs/TalendDescargados/ventas/e-1/__finalizado__-000000000000.csv.gz",
            metadata: { size: 3 },
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);
    const fileMock = vi.fn();
    const bucketMock = vi
      .fn()
      .mockReturnValue({
        getFiles: getFilesMock,
        file: fileMock,
      } as unknown as Bucket);
    const storageFake = { bucket: bucketMock } as unknown as Storage;
    const cliente = new ClienteGcs({
      projectId: "test-project",
      storage: storageFake,
    });

    expect(
      await cliente.estaFinalizada("POCs/TalendDescargados/ventas/e-1/"),
    ).toBe(true);
    expect(
      await cliente.estaFinalizada("POCs/TalendDescargados/ventas/e-2/"),
    ).toBe(false);
    expect(getFilesMock).toHaveBeenNthCalledWith(1, {
      prefix: "POCs/TalendDescargados/ventas/e-1/__finalizado__-",
      maxResults: 1,
    });
  });
});
