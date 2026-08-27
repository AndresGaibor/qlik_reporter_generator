export interface ColumnaPreviewBigQuery {
  nombre: string;
  tipo?: string;
  modo?: string;
}

export interface MetadataPreviewBigQuery {
  columnas: ColumnaPreviewBigQuery[];
}

export interface OpcionesMetadataPreview {
  columnas?: string[];
}

export interface OpcionesFilasPreview {
  maxFilas: number;
  columnas?: string[];
}

export interface FilasPreviewBigQuery {
  columnas: string[];
  filas: string[][];
}

export interface PuertoLecturaBigQuery {
  obtenerMetadataTabla(
    tabla: string,
    opciones?: OpcionesMetadataPreview,
  ): Promise<MetadataPreviewBigQuery>;

  obtenerFilasPreview(
    tabla: string,
    opciones: OpcionesFilasPreview,
  ): Promise<FilasPreviewBigQuery>;
}
