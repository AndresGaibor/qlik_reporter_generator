# Dataflow real y paridad de descargas con bq_reportes_creator

## Contexto

`qlik_reportes_creator` debe conservar la experiencia de ejecución y descarga de `bq_reportes_creator`, pero la definición del reporte vive en Qlik Dataflow y la ejecución obligatoria pasa por Qlik Automate → Talend → BigQuery.

El script real entregado por el usuario contiene configuración `SET`, una fuente BigQuery, un `LOAD`, un `RESIDENT` con filtro de fecha, un `STORE` y `DROP TABLE`. El `STORE` del Dataflow no define el destino real de ejecución: la plataforma genera una URI GCS única por ejecución bajo `gs://bkt_dwh/POCs/TalendDescargados/`.

## Flujo objetivo

```text
Qlik Dataflow /scripts/current
  → parser estricto
  → IR
  → BigQuery SELECT equivalente
  → cuatro queries Talend (staging / partes / export / drop)
  → VariableBlocks BqSelectData / BqNumberCsv / BqExportData / BqDrop
  → Qlik Automate
  → Talend tBigQuerySQLRow
  → BigQuery
  → GCS
  → /descargas + signed URLs
```

## Semántica del script real

Para el caso real, `SET ...` es configuración de entorno Qlik y no altera la consulta de datos soportada. `LIB CONNECT TO` identifica la fuente y debe ser BigQuery. El `LOAD` inicial proyecta `Fecha` y `Venta_Neta_USD`. El `RESIDENT` posterior filtra `Fecha = '6/1/2026'`; ese filtro debe sobrevivir en el SQL compilado.

`STORE ...` se ignora como sink porque la plataforma genera el `EXPORT DATA`. `DROP TABLE` solo afecta el ciclo de vida lógico Qlik y no debe hacer que desaparezca la tabla final que se almacenó inmediatamente antes.

El compilador debe soportar `LOAD *` y `SELECT *` con semántica wildcard real; nunca debe generar ``* AS `*` `` ni ``SELECT `*` ``. Ante construcciones no modeladas debe fallar cerrado.

## Corpus real

Se añade un fixture sanitizado derivado del script entregado. Los siguientes fixtures deben provenir de `scripts/current` reales o sanitizados: selección explícita, wildcard, filtros, joins, resident, agregaciones y funciones. Cada fixture declara compatible/incompatible y SQL esperado o invariantes semánticas.

## Descargas

Se porta el patrón robusto de `bq_reportes_creator`: un solo `showDirectoryPicker()` por descarga múltiple, streaming `ReadableStream → FileSystemWritableFileStream` sin materializar blobs completos, progreso por bytes y fallback con anchors cuando File System Access no está disponible.

El backend solo incluye objetos `parte-*.csv.gz` bajo el prefijo auditado de la ejecución. Las URLs firmadas V4 incluyen `responseDisposition: attachment` con el nombre del archivo. No se aceptan objetos fuera del bucket/prefijo permitido.

## Contrato Automate/Talend

La inspección real de `Test_BanCol_qlik_generator` confirmó que el Job Talend `Prueba_BigQuery` ya acepta un contrato probado de cuatro contextos: `bq_select_data`, `bq_number_csv`, `bq_export_data` y `bq_drop`, alimentados por los VariableBlocks `BqSelectData`, `BqNumberCsv`, `BqExportData` y `BqDrop`. La plataforma actualiza esos VariableBlocks y conserva intacto `credenciales`; no inventa parámetros nuevos en `executeTask`.

`bq_select_data` crea una staging única por ejecución con `export_part`; `bq_number_csv` enumera las particiones; `bq_export_data` usa `__PART__` y `__PART_PADDED__` para exportar CSV GZIP de máximo 1.000.000 filas; `bq_drop` elimina la staging y escribe un marcador oculto `__finalizado__-*` en el mismo prefijo GCS. El hash SHA-256 permanece únicamente en auditoría local.

Los runs reales de `Test_BanCol_qlik_generator` terminan en Qlik en 0–1 segundos, por lo que `finished` significa que Automate entregó la tarea a Talend, no que GCS ya esté listo. El estado local solo pasa a `completada` al detectar el marcador GCS `__finalizado__-*`; `failed` y `stopped` sí se sincronizan desde Qlik.

Por indicación del usuario, el agente no ejecuta consultas ni dry-runs en BigQuery. Toda prueba de SQL es local; la ejecución BigQuery end-to-end queda como paso manual del usuario.

## Pruebas y aceptación

- El script real entregado compila a SQL válido y conserva `Fecha = '6/1/2026'`.
- `SET`, `STORE` y `DROP TABLE` no contaminan el SQL final.
- `LOAD * / SELECT *` produce wildcard válido.
- El export mantiene CSV GZIP, `|` y máximo 1.000.000 filas, con staging única por ejecución y marcador GCS final.
- Un picker de carpeta sirve para todos los archivos y el flujo escribe por chunks.
- Las signed URLs fuerzan nombre de descarga y solo se firman `parte-*.csv.gz`.
- Cada ejecución vuelve a leer `current` y reemplaza las cuatro queries Talend antes del run.
- Tests focalizados pasan; los fallos baseline ajenos en Admin/Setup se documentan y no se atribuyen a esta feature.
