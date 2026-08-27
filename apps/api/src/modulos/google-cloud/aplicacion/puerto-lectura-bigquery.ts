export interface FilaBigQuery {
  columnas: string[];
  filas: string[][];
}

export interface OpcionesLecturaPreview {
  maxFilas?: number;
  columnas?: string[];
}

export interface PuertoLecturaBigQuery {
  obtenerFilasPreview(
    tabla: string,
    opciones?: OpcionesLecturaPreview,
  ): Promise<FilaBigQuery>;
}
