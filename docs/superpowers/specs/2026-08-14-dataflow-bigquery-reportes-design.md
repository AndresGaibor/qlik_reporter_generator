# Reportes diseñados con Qlik Dataflow y ejecutados con BigQuery

> **SUPERSEDIDA** — Esta especificación fue reemplazada por la spec del 2026-08-17.
> El contenido histórico se conserva sin modificaciones a efectos de auditoría.
> No describe el estado actual del producto.

## Objetivo

Evolucionar `qlik_reportes_creator` para que Qlik Dataflow sea el diseñador visual del reporte, mientras la ejecución continúa orquestada por Qlik Automate y el Job de Talend existente.

El Dataflow no se ejecuta. La plataforma lee su script actual, lo valida y lo compila a BigQuery Standard SQL. Luego genera el script de exportación, actualiza la automatización Qlik y dispara la ejecución que termina en Talend y BigQuery.

El proyecto principal y único que se modificará es `qlik_reportes_creator`. `qlik_automate_creator` y `bq_reportes_creator` se usan solamente como referencias de patrones ya probados.

## Decisiones centrales

- Qlik Dataflow define fuentes, campos, filtros, joins, transformaciones y agregaciones.
- Los Dataflows compatibles con reportes usan BigQuery como fuente.
- El Dataflow nunca se recarga ni se ejecuta para producir el reporte.
- Cada ejecución lee `GET /api/v1/apps/{id}/scripts/current` justo antes de compilar.
- El SQL no se considera una configuración permanente del reporte.
- Qlik Automate sigue siendo el orquestador que dispara el Job de Talend.
- Talend sigue ejecutando el script final mediante el componente BigQuery correspondiente.
- Toda ejecución, manual o programada, empieza en `qlik_reportes_creator`.
- El único destino de archivos es `gs://bkt_dwh/POCs/TalendDescargados/`.
- Cada bloque exportado tendrá como máximo 1.000.000 de filas y se generará como CSV comprimido con GZIP.

## Flujo de ejecución

Tanto la ejecución manual como la programada usan el mismo caso de uso:

1. La plataforma adquiere un lock por reporte/automatización.
2. Lee el script actual del Dataflow desde Qlik.
3. Calcula la huella SHA-256 del script leído.
4. Parsea el script y construye un modelo semántico intermedio.
5. Valida que todas las operaciones usadas sean compatibles.
6. Compila el modelo a un `SELECT` de BigQuery.
7. Valida el SQL y, cuando aplique, realiza dry-run para estimar bytes/coste.
8. Envuelve el `SELECT` con el script de exportación por bloques de hasta 1.000.000 de filas.
9. Actualiza `gcp_script` en el workspace de la automatización Qlik asociada.
10. Dispara la automatización Qlik mediante su API de runs.
11. Qlik Automate envía el contexto al Job de Talend.
12. Talend ejecuta el script en BigQuery.
13. BigQuery exporta los archivos a GCS.
14. La plataforma registra el resultado y libera el lock.

La ejecución se aborta antes de Qlik Automate si falla la lectura, el parsing, la validación o la compilación.

## Programación

Los schedules de reportes pertenecen funcionalmente a la plataforma. Un reporte programado no debe arrancar directamente desde un schedule autónomo de Qlik Automate, porque eso podría usar un SQL desactualizado.

Cuando llega la hora programada, `qlik_reportes_creator` invoca el mismo caso de uso de ejecución manual. Así se garantiza que el Dataflow se relea y el SQL se regenere en cada run.

## Concurrencia

La actualización de `gcp_script` modifica el workspace persistente de Qlik Automate antes del run. Por eso dos ejecuciones simultáneas de la misma automatización podrían pisarse.

La plataforma debe serializar la preparación y el disparo por reporte/automatización. El lock cubre al menos la secuencia `leer Dataflow → compilar → actualizar workspace → crear run`.

La integración con Qlik se encapsulará detrás de un servicio para que, si en el futuro la API permite pasar parámetros arbitrarios directamente al crear un run, pueda reemplazarse la mutación del workspace sin cambiar el compilador.

## Compilador Dataflow → BigQuery

No se hará sustitución directa mediante expresiones regulares. El pipeline será:

`script Qlik → parser → PlanDataflow → validación semántica → compilador BigQuery → SQL`.

El modelo intermedio representará fuentes, proyecciones, filtros, joins, alias, campos calculados, agrupaciones, agregaciones, distinct y ordenamiento. Las cadenas `LOAD`/`RESIDENT` se podrán representar como pasos lógicos que el compilador materialice mediante CTEs.

La primera versión soportará:

- selección y eliminación de campos;
- alias y renombrado;
- filtros con `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `IS NULL`, `AND` y `OR`;
- campos calculados con expresiones simples;
- conversiones comunes de texto, número y fecha;
- `INNER`, `LEFT`, `RIGHT` y `FULL JOIN`;
- `DISTINCT` o eliminación de duplicados;
- agrupaciones y `GROUP BY`;
- agregaciones `SUM`, `COUNT`, `MIN`, `MAX` y `AVG`;
- ordenamiento;
- fuentes `SQL SELECT ... FROM ...` de BigQuery;
- `DROP TABLE` como instrucción de ciclo de vida sin efecto en el SQL final.

`STORE` no define el destino del reporte. El destino final siempre lo controla la plataforma y apunta al bucket GCS configurado.

Las funciones Qlik se traducirán mediante nodos de expresión conocidos, no mediante reemplazos de texto. Ejemplos iniciales: `Upper` → `UPPER`, `Lower` → `LOWER`, `Trim` → `TRIM`, `Len` → `LENGTH`, `Year`/`Month` → `EXTRACT`, `If` → `CASE WHEN` y conversiones numéricas mediante `CAST`.

## Política ante operaciones no soportadas

El compilador es estricto y falla cerrado. Una operación que no pueda traducirse con semántica equivalente impide crear o ejecutar el reporte.

La respuesta de preflight debe identificar, cuando sea posible, la operación y el paso que causan la incompatibilidad. Nunca se ignorará silenciosamente una transformación desconocida.

## SQL fuente y script de exportación

La plataforma mantendrá dos artefactos separados por ejecución:

- `sqlBigQueryCompilado`: el `SELECT` que representa el Dataflow.
- `scriptBigQueryExportacion`: el script multi-statement que particiona y ejecuta `EXPORT DATA`.

La lógica de exportación seguirá el patrón probado en `bq_reportes_creator`: tabla temporal, numeración de filas, partición lógica por `max_rows`, bucle `WHILE`, `EXPORT DATA`, cabecera CSV y compresión GZIP.

El límite duro es 1.000.000 de filas por bloque lógico. La implementación debe conservar las pruebas de frontera para impedir valores superiores.

## Creación y edición de reportes

La pantalla actual dejará de construir el reporte mediante tabla, columnas y fechas. El Dataflow pasa a ser la única fuente de verdad para el diseño de datos.

La creación mostrará:

- nombre del reporte;
- selector de Dataflow Qlik;
- estado de compatibilidad;
- resumen de fuentes, filtros, joins, campos y transformaciones detectadas;
- campos de salida detectados;
- opción de inspeccionar el SQL compilado;
- estimación BigQuery cuando el dry-run sea posible;
- destino GCS de solo lectura.

Al seleccionar un Dataflow se ejecuta un preflight que lee `scripts/current`, parsea, valida y compila. Si el Dataflow es incompatible, la UI muestra los motivos y no permite crear un reporte ejecutable.

La edición del reporte permitirá modificar únicamente propiedades del reporte: nombre, Dataflow asociado, programación y estado activo/inactivo. Columnas, filtros, joins, cálculos y agregaciones se editan en Qlik Dataflow.

## Detalle del reporte

La vista de detalle mostrará el Dataflow asociado, la automatización Qlik, programación, destino, compatibilidad y un resumen del diseño detectado.

El botón `Ejecutar ahora` debe invocar el nuevo caso de uso de preparación y ejecución; no debe llamar directamente al endpoint genérico que dispara Qlik sin recompilar.

La vista ofrecerá acceso al SQL de la última ejecución y al historial de auditoría sin convertir esos snapshots en configuración reutilizable.

## Persistencia y auditoría

El reporte persistirá al menos su nombre, `flujoIdQlik`, nombre snapshot del Dataflow, `automatizacionIdQlik`, programación, estado y creador.

Cada ejecución guardará, como mínimo:

- identificador del reporte;
- `flujoIdQlik` y nombre del Dataflow;
- `automatizacionIdQlik` y run ID de Qlik;
- hash SHA-256 del script Dataflow;
- snapshot del script Dataflow realmente leído;
- SQL BigQuery compilado;
- script BigQuery de exportación enviado a Talend;
- versión del compilador;
- fecha de compilación e inicio/finalización;
- tipo de ejecución `manual` o `programada`;
- usuario que originó la ejecución cuando aplique;
- estado y detalle de error;
- metadatos de salida disponibles, como archivos, filas o identificador Talend.

El snapshot es exclusivamente de auditoría. Una ejecución futura nunca reutiliza el snapshot anterior: vuelve a leer `scripts/current`.

## Destino GCS

La raíz de exportación es fija:

`gs://bkt_dwh/POCs/TalendDescargados/`

Cada ejecución debe usar una ruta propia derivada del reporte y de un identificador de ejecución o timestamp para evitar colisiones entre runs. No se incorpora SFTP a este flujo.

## Componentes propuestos

Se mantendrán los límites modulares existentes y se añadirá una capa específica de compilación de reportes. La organización conceptual será:

- `flujos`: acceso a Qlik y lectura del script actual;
- `compilacion-reportes/dominio`: modelo intermedio y expresiones soportadas;
- `compilacion-reportes/aplicacion`: parsing, validación, compilación y preflight;
- `compilacion-reportes/infraestructura`: adaptadores BigQuery necesarios para dry-run;
- `reportes`: definición persistida del reporte y asociación con Dataflow/Automate;
- `ejecuciones`: preparación, lock, auditoría, actualización de `gcp_script` y disparo del run.

El parser existente usado para catálogo Spark puede aportar patrones de lectura, pero no se ampliará como un conjunto de regex hasta convertirlo en compilador. La nueva responsabilidad tendrá tipos y pruebas propias.

## Manejo de errores

Los errores se clasifican al menos en: lectura de Qlik, Dataflow incompatible, compilación, validación BigQuery, actualización de Automate, ejecución Qlik/Talend y exportación.

Un error previo al disparo no crea un run de Qlik. Un error posterior conserva toda la auditoría disponible, incluido hash y scripts preparados.

La UI debe mostrar mensajes accionables y distinguir un Dataflow incompatible de un fallo temporal de Qlik, Talend o BigQuery.

## Pruebas

- Parser: fixtures de scripts Qlik con fuentes, filtros, joins, LOAD/RESIDENT, cálculos y casos inválidos.
- Compilador: snapshots o comparaciones estructurales del SQL BigQuery generado.
- Expresiones: equivalencias Qlik → BigQuery y rechazo de funciones desconocidas.
- Exportador: 1, 999.999, 1.000.000, 1.000.001 y múltiples millones de filas lógicas.
- Preflight: compatible, incompatible y error de dry-run.
- Ejecución: asegura orden leer → hash → compilar → actualizar workspace → run.
- Concurrencia: dos intentos sobre el mismo reporte no pueden cruzar `gcp_script`.
- Auditoría: cada run conserva hash, snapshot, SQL y tipo de ejecución.
- Frontend: selección de Dataflow, compatibilidad, errores, creación y detalle.
- Regresión: creación/copia de Qlik Automate y ejecución vía Talend siguen funcionando.

## Compatibilidad y migración

No se hará una migración destructiva de automatizaciones antiguas. Los reportes nuevos creados con este diseño deben tener un Dataflow asociado. Las automatizaciones históricas sin `flujoIdQlik` quedan fuera del nuevo pipeline hasta que se asocien explícitamente a un Dataflow compatible.

La automatización base del tenant continúa siendo necesaria porque Qlik Automate se crea por copia. La nueva plantilla deberá contener el parámetro/contexto esperado por Talend para `gcp_script`.

## Fuera de alcance

- Ejecutar el Dataflow de Qlik como parte del reporte.
- Reemplazar Qlik Automate.
- Reemplazar el Job de Talend.
- Traducir arbitrariamente todo el lenguaje Qlik en la primera versión.
- Usar SFTP como origen o destino del resultado del reporte.
- Permitir editar manualmente desde la plataforma los campos, filtros o joins del Dataflow.

## Criterios de éxito

Un reporte compatible puede crearse seleccionando únicamente su Dataflow y propiedades de reporte. Al ejecutarlo, la plataforma relee el Dataflow actual, genera una huella nueva cuando cambia, compila SQL válido, actualiza Qlik Automate, dispara Talend y produce archivos GZIP en GCS sin superar 1.000.000 de filas por bloque lógico.

Una ejecución programada sigue exactamente el mismo pipeline que una manual. El historial permite reconstruir qué script Qlik, hash, SQL y script de exportación se utilizaron en cualquier ejecución registrada.
