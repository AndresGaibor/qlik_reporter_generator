# Automatizaciones personales reutilizables para reportes

## Estado y relación con specs anteriores

Esta especificación define la arquitectura vigente de propiedad y ejecución de reportes en `qlik_reportes_creator`.

Supersede las partes de specs anteriores que modelan una automatización Qlik por reporte. Conserva el contrato vigente de `2026-08-17-dataflow-real-descargas-paridad-design.md`: Dataflow actual → parser/IR → BigQuery SQL → cuatro queries Talend → Qlik Automate → Talend → BigQuery → GCS → `/descargas`.

El proyecto principal y único que se modifica es `qlik_reportes_creator`. `bq_reportes_creator` y `qlik_automate_creator` siguen siendo referencias de comportamiento, no destinos de cambios.

## Objetivo

Eliminar la proliferación de Qlik Automates generados por reporte. Cada reporte será una entidad propia de PostgreSQL asociada a un Dataflow, mientras que cada combinación `usuario + tenant Qlik` dispondrá como máximo de una automatización personal reutilizable que actúa como worker privado.

La cantidad de Automates generados pasa a crecer con usuarios activos por tenant, no con la cantidad de reportes.

## Principios centrales

- Qlik Dataflow sigue siendo el diseñador visual del reporte y no se ejecuta.
- Cada ejecución vuelve a leer `scripts/current`; nunca reutiliza SQL de una ejecución anterior.
- El reporte no posee ni persiste un Automate Qlik propio.
- Los reportes pertenecen a la organización/tenant y pueden ejecutarlos los usuarios autorizados.
- El usuario que pulsa Ejecutar usa su worker personal del tenant activo.
- El worker se crea de forma perezosa en el primer uso y luego se reutiliza.
- La plantilla base del tenant nunca se modifica ni se ejecuta durante una corrida.
- Qlik Automate y Talend continúan siendo obligatorios en runtime.
- La salida sigue siendo exclusivamente GCS bajo `gs://bkt_dwh/POCs/TalendDescargados/`.

## 1. Arquitectura y propiedad

El tenant conserva una automatización base administrada. Esta automatización funciona únicamente como plantilla para crear workers personales.

```text
Tenant Qlik
├── Automatización base
├── Andres → Automate personal Andres
├── Joseph → Automate personal Joseph
└── Reportes
    ├── Ventas → Dataflow A
    ├── Inventario → Dataflow B
    └── Comercial → Dataflow C
```

Un reporte guarda nombre, organización, tenant, creador, Dataflow y metadata de presentación/estado. No guarda `automatizacionIdQlik` ni nombre snapshot del Automate.

Cuando un usuario ejecuta un reporte, la plataforma resuelve su worker mediante `usuario + tenant Qlik`. Si no existe, lo crea desde la plantilla base, valida la copia y persiste la asociación en PostgreSQL.

Un mismo reporte puede ser ejecutado por usuarios distintos. Cada ejecución usa el worker del usuario ejecutor, sin duplicar el reporte ni crear un Automate específico para él.

La plantilla base debe contener físicamente los VariableBlocks `Credenciales`, `BqSelectData`, `BqNumberCsv`, `BqExportData`, `BqDrop` y un `executeTask` compatible con el contrato Talend. La plataforma valida estrictamente este contrato y no repara automáticamente plantillas incompletas.

## 2. Ciclo de vida del worker personal

La creación es perezosa: crear o editar reportes no crea workers. El primer intento de ejecución en un tenant resuelve o crea el worker.

```text
Ejecutar reporte
→ buscar worker(usuario, tenant)
→ si existe, reutilizar
→ si no existe, adquirir lock de creación
→ volver a consultar
→ validar plantilla base
→ copiar plantilla
→ asignar propietario Qlik si es posible
→ validar copia
→ guardar worker
→ liberar lock
```

PostgreSQL debe imponer `UNIQUE(usuario_id, tenant_qlik_id)` para impedir duplicados incluso ante solicitudes concurrentes.

El nombre visible del Automate será estable y ajeno a cualquier reporte, por ejemplo `Reportes - Andres Gaibor - Davivienda`. Un cambio posterior del nombre del usuario no obliga a renombrarlo.

Si PostgreSQL referencia un worker que fue eliminado manualmente en Qlik y Qlik responde `404`, la plataforma puede recrearlo automáticamente desde una plantilla válida y actualizar la asociación.

Si el worker todavía existe pero su workspace fue modificado y ya no cumple el contrato Talend, la plataforma lo reemplaza desde la plantilla validada; nunca sobrescribe silenciosamente cambios manuales. Un administrador puede forzar el mismo reemplazo desde la plantilla base.

## 3. Concurrencia

El lock no cubre toda la ejecución Talend. Solo serializa la sección crítica que muta el workspace del worker y crea el run de Qlik.

El Dataflow puede leerse y compilarse antes del lock. La secuencia crítica es:

```text
LOCK worker(usuario, tenant)
→ obtener Automate actual
→ validar contrato Talend
→ inyectar BqSelectData/BqNumberCsv/BqExportData/BqDrop
→ PUT workspace
→ POST run
→ guardar runId
→ UNLOCK
```

Después del `POST run`, Talend puede continuar procesando mientras el mismo usuario inicia otro reporte. Dos jobs Talend pueden coexistir; lo que no puede cruzarse es `actualizar workspace → lanzar run` sobre el mismo worker.

Los locks de usuarios distintos son independientes. La clave conceptual será equivalente a `automatizacion-personal:<tenantId>:<usuarioId>` y debe reutilizar la infraestructura PostgreSQL de advisory locks existente.

No se bloqueará una nueva ejecución solo porque Qlik conserve un run anterior como activo. Ya se comprobó que Qlik puede finalizar en 0–1 segundos mientras Talend continúa. El estado real de finalización sigue determinado por GCS y el marcador `__finalizado__-*`.

## 4. Modelo de datos objetivo

La entidad actualmente llamada `configuraciones_automatizacion` representa realmente reportes. La migración debe convertirla conceptualmente en `reportes` y retirar de ella la propiedad del Automate.

`reportes` conserva como mínimo: `id`, `organizacion_id`, `tenant_qlik_id`, `creado_por_usuario_id`, `nombre`, `flujo_id_qlik`, `flujo_nombre_snapshot`, `flujo_espacio_id_qlik`, `estado`, `mensaje_error`, `creado_en` y `actualizado_en`.

Se eliminan del reporte `automatizacion_id_qlik` y `automatizacion_nombre_snapshot`.

Se introduce `automatizaciones_personales_qlik` con:

```text
id
organizacion_id
tenant_qlik_id
usuario_id
automatizacion_id_qlik
automatizacion_nombre_snapshot
estado
mensaje_error
creado_en
actualizado_en
UNIQUE(usuario_id, tenant_qlik_id)
```

La fila representa el worker vigente, no un historial de generaciones. Si se recrea el worker, se actualiza la asociación. Las ejecuciones preservan el ID Qlik histórico utilizado.

## 5. Auditoría de ejecuciones

`ejecuciones_reportes` continúa siendo el registro histórico de lo que realmente ocurrió. Debe añadir `ejecutado_por_usuario_id` y conservar `automatizacion_id_qlik` como snapshot del worker usado.

Se recomienda además una FK nullable `automatizacion_personal_id` para diagnóstico operativo, sin sustituir el snapshot histórico del ID Qlik.

Cada ejecución conserva al menos:

```text
reporte_id
ejecutado_por_usuario_id
flujo_id_qlik
automatizacion_personal_id nullable
automatizacion_id_qlik
run_id_qlik
hash_dataflow_sha256
script_dataflow
sql_bigquery_compilado
script_exportacion
uri_base_gcs
version_compilador
estado / etapa_error / mensaje_error
iniciado_en / finalizado_en / creado_en / actualizado_en
```

Recrear un worker no reescribe ejecuciones antiguas. Una ejecución que utilizó el Automate `abc` debe seguir registrando `abc` aunque el worker vigente pase a ser `xyz`.

## 6. Migración desde el modelo actual

La migración es hacia adelante y no reescribe migraciones aplicadas. Debe preservar IDs de reportes y toda la historia de `ejecuciones_reportes`.

Los Automates actualmente asociados a reportes no se convierten automáticamente en workers personales, porque eso conservaría la proliferación que este diseño elimina.

La migración hace conceptualmente:

```text
configuraciones_automatizacion → reportes
retirar automatizacion_id_qlik del reporte
retirar automatizacion_nombre_snapshot del reporte
crear automatizaciones_personales_qlik
añadir ejecutado_por_usuario_id a ejecuciones
preservar automatizacion_id_qlik histórico en ejecuciones
```

Los Automates antiguos existentes en Qlik tampoco se borran automáticamente. La aplicación deja de referenciarlos; una limpieza remota posterior será una operación separada y explícita.

En el primer uso posterior a la migración, el usuario todavía no tendrá worker personal. Ese primer `Ejecutar` crea uno desde la plantilla base y las ejecuciones siguientes lo reutilizan.

## 7. Crear y editar reportes

Crear un reporte ya no copia ninguna automatización Qlik. El flujo es: nombre → seleccionar Dataflow → leer `scripts/current` → parser/compilador → preflight/dry-run permitido → guardar reporte en PostgreSQL.

La creación perezosa del worker ocurre únicamente al ejecutar. Crear 50 reportes sin ejecutarlos debe producir cero workers personales.

La edición permite nombre, Dataflow y estado activo/inactivo. Cambiar el Dataflow obliga a preflight de compatibilidad antes de persistir. Cambiar el nombre solo actualiza PostgreSQL; no renombra ningún Automate.

Clonar un reporte crea otra fila de reporte con el mismo Dataflow y un nombre nuevo. No copia un Automate.

Las operaciones de diseño de datos —campos, filtros, joins, cálculos y agregaciones— continúan editándose exclusivamente en Qlik Dataflow.

## 8. Catálogo y rutas de reportes

`/reportes` deja de ser una vista de Qlik Automations. Debe listar únicamente reportes de PostgreSQL autorizados para la organización y tenant activos.

No aparecen en el catálogo la plantilla base, workers personales, Automates manuales ni recursos Qlik sin configuración local.

Las rutas pasan a identificar el recurso por `reporteId`, por ejemplo `/reportes/:reporteId`. Los endpoints de configuración, ejecución, historial y clonación usan ese ID local, no `automatizacionIdQlik`.

## 9. Visibilidad y permisos

Los reportes son recursos compartidos de la organización/tenant. La vista de usuario final no filtra por propietario Qlik, nombre del propietario ni coincidencias con el nombre del reporte.

El creador se conserva como metadata y puede mostrarse como `Creado por`, pero no determina quién puede ejecutar. La autorización se resuelve por membresía/roles de la organización y tenant activo.

Al ejecutar, la identidad autenticada determina el worker personal. El cliente nunca envía un `usuarioId` o `automatizacionIdQlik` confiable para escoger worker.

## 10. Detalle y auditoría en UI

La vista normal del reporte muestra nombre, Dataflow, espacio Qlik, compatibilidad actual, destino GCS, creador e historial de ejecuciones. El worker no es información primaria para un usuario final.

La auditoría administrativa de cada ejecución sí muestra usuario ejecutor, hash SHA-256, script Dataflow, SQL compilado, cuatro queries Talend, worker/Automate Qlik utilizado, run ID, URI GCS y timestamps.

Se elimina el estado conceptual `Automatización de Qlik sin configuración local` de la navegación de reportes, porque recursos Qlik arbitrarios ya no son reportes de la plataforma.

La terminología frontend debe migrar gradualmente de `Automatizacion` a `Reporte` donde el componente represente producto: `PaginaReportes`, `PaginaNuevoReporte`, `PaginaDetalleReporte`, `ListaReportes`, etc. Los nombres de infraestructura Qlik se conservan únicamente donde realmente se administran Automates.

## 11. Flujo completo de ejecución

La ejecución definitiva es:

```text
usuario pulsa Ejecutar
→ obtener reporte por reporteId
→ validar organización/tenant/permisos/estado
→ leer Dataflow scripts/current
→ calcular SHA-256
→ parser → IR → BigQuery SQL
→ validar compatibilidad y preflight
→ generar executionId y URI GCS única
→ generar BqSelectData/BqNumberCsv/BqExportData/BqDrop
→ resolver o crear worker(usuario, tenant)
→ crear auditoría en estado preparando con el worker exacto
→ lock corto del worker
→ validar workspace
→ inyectar cuatro queries
→ actualizar Automate
→ lanzar run Qlik
→ guardar runId
→ liberar lock
→ Talend → BigQuery → GCS
→ detectar __finalizado__
→ marcar completada
```

El compilador, la estrategia staging, el límite de 1.000.000 de filas, CSV GZIP, delimitador `|`, cuatro contextos Talend y marcador `__finalizado__-*` conservan la semántica de la spec del 17 de agosto.

## 12. Detención y estados

La UX normal no ofrecerá `Detener ejecución` mediante el stop del run Qlik como si cancelara el reporte completo. Una vez Qlik entrega la tarea a Talend, detener el Automate no garantiza cancelar Talend ni BigQuery.

Los estados visibles se simplifican a `Preparando`, `Procesando`, `Completada` y `Error`, mapeados desde el estado técnico local.

Una cancelación real de Talend sería una funcionalidad separada que debe usar la API de ejecución de Talend y queda fuera de este alcance.

## 13. Administración de plantilla y workers

La administración del tenant describirá la automatización base como plantilla para workers personales, no como plantilla que se copia por reporte.

Al configurar una plantilla, la plataforma obtiene su workspace y ejecuta `validarContratoTalend`. Si falta cualquiera de los cinco VariableBlocks requeridos o `executeTask` no coincide con el contrato esperado, no se guarda el cambio.

La vista admin puede mostrar un bloque diagnóstico pequeño de workers personales por tenant: usuario, nombre/ID Qlik, estado y enlace a Qlik. No se crea una navegación completa adicional.

Para un worker existente pero incompatible, el admin puede ejecutar `Recrear desde plantilla`. Esta operación crea una copia nueva validada, actualiza la asociación y deja la automatización anterior fuera de uso; no modifica el workspace roto in-place.

El workspace técnico se mantiene de solo lectura desde la plataforma.

## 14. Manejo de errores

Los errores deben ser accionables y no exponer detalles técnicos innecesarios a usuarios finales.

- `DATAFLOW_NO_COMPATIBLE`: mostrar operación/paso no soportado cuando sea seguro.
- `SIN_AUTOMATIZACION_BASE`: indicar que el entorno no está preparado y que un admin debe configurar la plantilla.
- `PLANTILLA_INCOMPATIBLE`: bloquear creación de workers y mostrar detalles estructurales solo a administradores.
- `WORKER_REPAIR_FAILED`: no iniciar Talend ni cambiar la asociación; mostrar un mensaje genérico y conservar el diagnóstico técnico.
- fallo creando worker: no iniciar Talend y conservar auditoría del intento.
- fallo actualizando workspace o creando run: marcar ejecución en error con etapa correspondiente.
- fallo posterior de Talend/GCS: mantener la ejecución y sus snapshots; `/descargas` no la considera completada sin marcador final.

Un fallo antes de `POST run` nunca debe dejar al usuario creyendo que Talend arrancó.

## 15. Descargas

`/descargas` continúa desacoplado del worker vigente. Opera sobre la ejecución auditada, `uriBaseGcs`, objetos `parte-*.csv.gz` y el marcador `__finalizado__-*`.

Recrear o eliminar un worker no altera descargas históricas. Se mantienen streaming, progreso por bytes, signed URLs V4 y validación estricta del bucket/prefijo ya implementados.

## 16. Contratos y API objetivo

La API pública de reportes debe usar IDs locales. Como mínimo se necesitan operaciones equivalentes a:

```text
GET    /reportes
POST   /reportes
GET    /reportes/:reporteId
PUT    /reportes/:reporteId
POST   /reportes/:reporteId/clonar
POST   /reportes/:reporteId/ejecuciones
GET    /reportes/:reporteId/ejecuciones
GET    /reportes/dataflows/:flujoId/preflight
```

Los endpoints genéricos que listan Automates Qlik no deben alimentar `/reportes`. Si siguen siendo necesarios para administración de plantilla/workspace, deben quedar en una superficie técnica/admin y no confundirse con el dominio de reportes.

La creación cambia de `crearAutomatizacionDesdePlantilla` a un caso de uso de `crearReporte`. La copia Qlik se encapsula en un servicio interno equivalente a `ObtenerOCrearAutomatizacionPersonal`.

La ejecución recibe `reporteId`; `usuarioId`, `tenantId`, organización y la identidad Qlik se resuelven desde la sesión autenticada. No se permite elegir un worker arbitrario desde el cliente.

Los contratos de detalle/configuración dejan de requerir `automatizacionIdQlik` como propiedad del reporte. Ese dato permanece únicamente en workers y ejecuciones.

## 17. Pruebas requeridas

La implementación seguirá TDD. La matriz mínima incluye:

- creación de reporte compatible no llama a `copiarAutomatizacion`;
- crear muchos reportes no crea workers;
- primer `Ejecutar` crea exactamente un worker para `usuario + tenant`;
- dos primeros usos concurrentes no crean dos workers;
- segundo reporte del mismo usuario/tenant reutiliza el worker;
- el mismo usuario en otro tenant obtiene otro worker;
- usuarios distintos del mismo tenant usan workers distintos;
- un reporte compartido puede ejecutarse por dos usuarios sin duplicarse;
- lock cubre actualización de workspace + creación de run y se libera inmediatamente después;
- dos ejecuciones pueden continuar en Talend simultáneamente sin cruzar sus cuatro queries;
- worker `404` se recrea; worker estructuralmente incompatible falla cerrado;
- plantilla incompatible se rechaza al configurarla y antes de crear workers;
- cada ejecución guarda usuario, Automate Qlik exacto, run, hash, script, SQL y URI GCS;
- migración conserva reportes e historia de ejecuciones existentes;
- `/reportes` no lista Automates arbitrarios de Qlik;
- usuario final no filtra reportes por propietario Qlik;
- renombrar/clonar reporte no muta ni copia Automates;
- UI no ofrece stop Qlik como cancelación completa;
- `/descargas` sigue usando marcador GCS y no depende del worker vigente.

La verificación final incluye tests API/contratos/web, typecheck, build, Biome y `git diff --check`. Las pruebas de integración externas deben evitar ejecutar BigQuery real salvo instrucción explícita del usuario.

## 18. Fuera de alcance

- Crear un pool de múltiples workers por usuario para aumentar concurrencia.
- Ejecutar Qlik Dataflow como motor de datos.
- Reemplazar Qlik Automate o Talend.
- Borrar automáticamente Automates legacy del tenant durante la migración.
- Reparar bloques individuales de una plantilla o worker incompatible.
- Permitir edición del workspace técnico desde la UI.
- Implementar cancelación real de Talend.
- Reintroducir schedules/cron de reportes.
- Cambiar el destino GCS o reincorporar SFTP.

## 19. Criterios de aceptación

La arquitectura se considera implementada cuando:

1. `reportes` es una entidad PostgreSQL independiente de Qlik Automate.
2. Crear, editar y clonar reportes no crea ni modifica Automates.
3. Existe como máximo un worker vigente por `usuario + tenant Qlik` y se crea en el primer uso.
4. Todos los reportes autorizados del tenant pueden ejecutarse con el worker del usuario actual.
5. El lock corto impide cruces de workspace sin bloquear la duración completa de Talend.
6. Cada ejecución relee Dataflow, recompila y conserva auditoría completa del worker/run realmente usados.
7. `/reportes` muestra reportes locales, no el inventario de Qlik Automations.
8. La plantilla base se valida estrictamente y nunca se auto-repara.
9. El flujo Talend/BigQuery/GCS conserva las cuatro queries, límite de 1.000.000, GZIP y marcador `__finalizado__`.
10. `/descargas` continúa funcionando con ejecuciones nuevas e históricas independientemente de la generación actual del worker.
