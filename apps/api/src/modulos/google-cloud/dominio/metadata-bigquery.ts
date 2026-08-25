export type ModoCampoBigQuery = "NULLABLE" | "REQUIRED" | "REPEATED";

export interface MetadataCampoBigQuery {
  type: string;
  mode: ModoCampoBigQuery;
  precision?: number;
  scale?: number;
  maxLength?: number;
  fields?: Readonly<Record<string, MetadataCampoBigQuery>>;
}

export interface MetadataParticionTiempoBigQuery {
  type?: string;
  field?: string;
  expirationMs?: number;
  requirePartitionFilter?: boolean;
}

export interface MetadataParticionRangoBigQuery {
  field: string;
  range?: {
    start?: number;
    end?: number;
    interval?: number;
  };
}

export interface MetadataTablaBigQuery {
  tableId: string;
  fields: Readonly<Record<string, MetadataCampoBigQuery>>;
  numBytes?: number;
  timePartitioning?: MetadataParticionTiempoBigQuery;
  rangePartitioning?: MetadataParticionRangoBigQuery;
  clusteringFields?: readonly string[];
}

export type CatalogoMetadataBigQuery = Readonly<
  Record<string, MetadataTablaBigQuery>
>;
