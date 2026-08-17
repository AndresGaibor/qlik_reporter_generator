# Diseño: Qlik + Google Cloud, Dataflows y Descargas

**Fecha:** 2026-08-17

## Objetivo

Simplificar `qlik_reportes_creator` para que su producto activo tenga únicamente integraciones externas directas con **Qlik Cloud** y **Google Cloud**, eliminando programación propia y código activo heredado de Impala, Spark, SFTP, JDBC y conectores genéricos que ya no pertenecen al producto.

Además, se corrige el listado de Dataflows y se incorpora una experiencia `/descargas` equivalente a la de `bq_reportes_creator`, adaptada al flujo Qlik Automate → Talend → BigQuery → GCS.

## Límites de integración

La arquitectura activa queda reducida a:

```text
qlik_reportes_creator
├── Qlik Cloud
│   ├── OAuth
│   ├── Dataflows
│   └── Qlik Automate
├── Google Cloud
│   ├── BigQuery
│   └── Cloud Storage
└── PostgreSQL
    └── persistencia interna de la aplicación
```

PostgreSQL es infraestructura interna y no se considera una integración externa.

Talend se mantiene únicamente como componente downstream invocado por Qlik Automate. `qlik_reportes_creator` no tendrá cliente, credenciales ni llamadas directas a una API de Talend.

## Dataflows

El error actual del selector de Dataflows se debe a que el módulo de flujos existe, pero `/api/flujos` no está montado en el composition root activo de `qlik_reportes_creator`.

La corrección será estructural:

- montar `/api/flujos` usando `crearRutasFlujos` y `ConsultaFlujosQlik`, siguiendo el patrón probado de `qlik_automate_creator`;
- usar el mismo `resolverQlik` autenticado que consume el resto de la plataforma;
- mantener filtros opcionales por espacio y búsqueda;
- hacer que `/flujos` y el selector de creación/edición de reportes consuman el mismo módulo frontend `modulos/flujos/api.ts`;
- eliminar la función duplicada `obtenerFlujosConFiltros` de `modulos/reportes/api.ts`;
- preservar `/flujos/:id/script` para inspeccionar `scripts/current`;
- eliminar `/flujos/:id/catalogo-spark` y todo el código que lo soporta.

Los errores del selector deben mostrar el mensaje real retornado por la API, especialmente sesión Qlik expirada, permisos insuficientes o fallo del tenant.

Para ejecución de reportes, el compilador seguirá aceptando únicamente Dataflows cuyas fuentes de datos ejecutables sean BigQuery. Un Dataflow que dependa de otro origen se mostrará como no compatible y no se ejecutará.

## Ejecución manual únicamente

La plataforma ya no tendrá programación propia de reportes. Todas las ejecuciones son iniciadas manualmente desde `qlik_reportes_creator`.

Se elimina de código activo:

- controles de programación en crear/editar/detalle;
- contratos cron y zonas horarias;
- `cron-parser`;
- scheduler y bucle periódico de Bun/Node;
- claim distribuido de programaciones;
- resolución/refresh OAuth creada exclusivamente para ejecuciones programadas; el refresh OAuth genérico necesario para una sesión interactiva puede conservarse si tiene consumidores reales;
- métodos de repositorio para listar/reclamar schedules;
- tabla activa `programaciones_automatizacion` mediante una migración nueva.

Qlik Automate seguirá guardándose con `schedules: []` para impedir ejecuciones que salten el pipeline de preparación del SQL.

El tipo de ejecución auditado pasa a ser únicamente `manual`. Una migración nueva ajustará el constraint de `ejecuciones_reportes.tipo_ejecucion` sin reescribir migraciones históricas.

## Limpieza de integraciones legacy

El código activo y la documentación vigente no deben exponer ni depender de:

- Impala;
- Spark;
- SFTP;
- JDBC genérico;
- PostgreSQL como origen o destino de datos;
- APIs remotas propias para catálogos/esquemas;
- catálogos técnicos de conexiones de origen.

Se eliminarán módulos activos como el generador de catálogo Spark, rutas `/catalogo-spark`, UI asociada, contratos de destinos `impala/postgres/sftp`, dependencias `ssh2-sftp-client` y páginas/rutas de conexiones de origen que no sean necesarias para Qlik o Google Cloud.

La abstracción de destinos puede mantenerse solo si sigue aportando valor interno, pero sus implementaciones activas quedarán restringidas a BigQuery/GCS. No se conservarán opciones invisibles o tipos muertos de otros proveedores.

### Migraciones históricas

No se modificarán migraciones ya publicadas/aplicadas aunque contengan nombres legacy. Una nueva migración será responsable de eliminar tablas, constraints o tipos que todavía estén presentes en el esquema actual.

La documentación histórica puede conservar referencias antiguas únicamente cuando esté claramente identificada como historial. README, arquitectura, setup y documentación operativa vigente describirán exclusivamente el producto actual.

## Descargas

Se añade la ruta web `/descargas`, visible en la navegación principal, siguiendo la UX probada de `bq_reportes_creator`.

La fuente de verdad para localizar archivos es la auditoría de cada ejecución, que ya guarda `uriBaseGcs`.

Flujo de descarga:

```text
ejecución completada
    ↓
uriBaseGcs auditado
    ↓
parsear gs://bucket/prefix/
    ↓
Google Cloud Storage list(prefix)
    ↓
filtrar objetos de archivo válidos
    ↓
obtener tamaño/metadatos
    ↓
generar signed URL temporal por archivo
    ↓
manifest de descarga
    ↓
/descargas
```

No se añadirá una tabla duplicada de archivos si GCS puede resolverlos de forma autoritativa por prefijo.

La API expondrá una operación de manifiesto por ejecución que:

1. valida que la ejecución pertenezca al tenant/organización del usuario;
2. exige estado completado;
3. valida que `uriBaseGcs` pertenezca al destino permitido;
4. lista objetos exclusivamente debajo de ese prefijo;
5. excluye carpetas virtuales y objetos no descargables;
6. devuelve nombre, tamaño y URL firmada de duración limitada.

La página soportará File System Access API cuando esté disponible para guardar múltiples archivos con progreso y, como fallback, descargas normales del navegador con enlaces individuales.

## Manejo de errores

Para Dataflows:

- sesión Qlik inválida o expirada → error de autenticación explícito;
- permisos insuficientes → error de autorización explícito;
- Dataflow eliminado → estado no disponible, sin reutilizar SQL antiguo;
- fallo de Qlik → mensaje técnico seguro, no “lista vacía” silenciosa.

Para descargas:

- ejecución pendiente/iniciada → no se ofrecen archivos todavía;
- ejecución completada pero prefijo vacío → indicar que GCS no contiene resultados para esa ejecución;
- objeto desaparecido → regenerar manifiesto y mostrar archivo no disponible;
- fallo al firmar URL → no exponer credenciales y permitir reintento;
- un prefijo fuera del bucket/ruta permitidos debe rechazarse incluso si aparece en la base.

## Seguridad

Las rutas de GCS nunca aceptan bucket/prefix arbitrarios enviados por el navegador. El backend obtiene `uriBaseGcs` exclusivamente de la ejecución persistida y valida el prefijo contra la configuración permitida.

Las URLs firmadas tienen expiración corta configurable. Las credenciales de Google Cloud permanecen en el backend.

La plataforma no enviará SQL, tokens Qlik ni credenciales Google al módulo de descargas salvo las signed URLs resultantes.

## Pruebas de aceptación

- `GET /api/flujos` está montado en la aplicación real y devuelve los mismos Dataflows que la pantalla `/flujos`.
- Crear/editar reporte reutiliza `modulos/flujos/api.ts` y no mantiene un cliente duplicado.
- No existe UI ni contrato que permita configurar cron o zona horaria.
- No se inicia scheduler en Bun ni Node.
- El runtime activo no importa `cron-parser`.
- Código activo y documentación vigente no contienen funcionalidades Impala/SFTP/Spark/JDBC.
- Las dependencias SFTP son eliminadas.
- `/descargas` aparece en navegación y lista ejecuciones del usuario.
- Una ejecución completada descubre uno o varios objetos por su prefijo GCS y genera signed URLs.
- Se prueba descarga de múltiples archivos, progreso, fallback de navegador y ausencia de archivos.
- El pipeline manual Dataflow → SQL → Qlik Automate → Talend → BigQuery/GCS sigue pasando sus regresiones.

## Fuera de alcance

No se reescriben migraciones históricas ya aplicadas. No se elimina PostgreSQL interno. No se elimina Talend del pipeline downstream de Qlik Automate. No se añade otra API externa ni otro proveedor de almacenamiento.
