# Limpieza de esquema y UI legacy

## Objetivo
Dejar `qlik_reportes_creator` alineado únicamente con el flujo vigente Qlik Dataflow → Qlik Automate → Talend → BigQuery/GCS, eliminando infraestructura y UX heredadas que ya no participan en ese flujo.

## Principios
- No reescribir migraciones históricas aplicadas; usar una migración nueva hacia adelante.
- Mantener PostgreSQL como persistencia interna.
- Mantener Qlik Cloud y Google Cloud como únicas integraciones externas directas.
- No ejecutar consultas BigQuery durante la limpieza.
- Mantener auditoría e idempotencia; eliminar Outbox porque no tiene consumidor.

## Esquema objetivo
Se eliminan tablas físicas legacy fuera de Drizzle: `_migrations_lock`, `configuracion_espacios_visibles`, `configuraciones_plataforma`, `espacios_visibles_usuario_final`, `secretos_conexion_destino`.

Se eliminan también tablas declaradas pero sin consumidores: `espacios_qlik_cache`, `flujos_qlik_cache`, `automatizaciones_qlik_cache`, `intentos_oauth_qlik` y `eventos_outbox`.

Se eliminan columnas legacy `automatizacion_plantilla_modo_1_*`, `automatizacion_plantilla_modo_2_*` de `tenants_qlik` y `probada_en` de `conexiones_destino`.

## Código y UI
- Eliminar el Outbox completo y su inyección en creación de reportes.
- Eliminar `/tablas`/“Resultados BigQuery”, porque ya no define reportes y conserva `tablaId`.
- Mantener el cliente BigQuery mínimo necesario para dry-run/preflight; retirar catálogo, preview y endpoints genéricos sin consumidores.
- Eliminar archivos productivos huérfanos confirmados por el grafo de imports y la carpeta vacía `origenes`.
- Simplificar roles persistidos a `admin | usuario`, conservando una migración de datos para valores históricos.

## Housekeeping
- Eliminar sesiones expiradas/revocadas de la BD actual.
- Eliminar solicitudes idempotentes expiradas de la BD actual; conservar el mecanismo de idempotencia.
- No añadir un scheduler: la limpieza se ejecuta al aplicar la migración y puede complementarse más adelante con mantenimiento explícito si fuera necesario.

## Criterios de aceptación
- Tests, typecheck, build y Biome verdes.
- `/flujos`, `/reportes` y `/descargas` siguen activos.
- No existe `/tablas` en router/navegación ni `tablaId` como flujo de creación.
- Outbox y caches Qlik no existen en código activo ni esquema Drizzle.
- La BD real no conserva las tablas/columnas legacy enumeradas.
- Ninguna acción de esta implementación ejecuta BigQuery.
