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
  → EXPORT DATA ≤ 1.000.000 filas
  → gcp_script en executeTask
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

Antes de cada run se lee `scripts/current`, se recompila y se actualiza únicamente el bloque `executeTask` con `gcp_script` y `gcp_dataflow_hash`. El run se crea solo después del PUT exitoso. Se conserva un fixture sanitizado del workspace real cuando pueda obtenerse desde Qlik.

Debe validarse con una ejecución real que `finished` de Qlik Automate ocurre después de que Talend/BigQuery/GCS termina. Si Automate termina antes, la descarga no podrá marcarse completada solo por el estado de Qlik; deberá comprobarse la presencia de objetos GCS.

## Pruebas y aceptación

- El script real entregado compila a SQL válido y conserva `Fecha = '6/1/2026'`.
- `SET`, `STORE` y `DROP TABLE` no contaminan el SQL final.
- `LOAD * / SELECT *` produce wildcard válido.
- El export mantiene CSV GZIP, `|` y máximo 1.000.000 filas.
- Un picker de carpeta sirve para todos los archivos y el flujo escribe por chunks.
- Las signed URLs fuerzan nombre de descarga y solo se firman `parte-*.csv.gz`.
- Cada ejecución vuelve a leer `current` y reemplaza `gcp_script` antes del run.
- Tests focalizados pasan; los fallos baseline ajenos en Admin/Setup se documentan y no se atribuyen a esta feature.
