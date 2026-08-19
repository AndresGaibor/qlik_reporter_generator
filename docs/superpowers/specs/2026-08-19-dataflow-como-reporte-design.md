# Dataflow de Qlik como reporte ejecutable

## Estado y relación con specs anteriores

Esta especificación define el modelo de producto vigente: un Dataflow de Qlik es directamente un reporte ejecutable. PostgreSQL deja de mantener un catálogo local duplicado de reportes.

Supersede de `2026-08-18-automatizaciones-personales-reportes-design.md` únicamente las secciones que modelan `reportes` como entidad PostgreSQL, usan `reporteId` local, o definen crear, editar y clonar reportes locales.

Conserva de esa spec el worker personal por `usuario + tenant`, creación perezosa, validación estricta de plantilla, recreación controlada, lock corto, snapshots del Automate usado y diagnóstico administrativo.

Conserva además el contrato runtime de `2026-08-17-dataflow-real-descargas-paridad-design.md`: `scripts/current` → parser/IR → BigQuery SQL → cuatro queries Talend → Qlik Automate → Talend → BigQuery → GCS → `/descargas`.

Conserva `2026-08-18-descargas-privadas-por-usuario-design.md`: usuarios finales solo ven sus ejecuciones/descargas y administradores pueden consultar el ámbito completo del tenant autorizado.

## Objetivo

Eliminar la entidad local `reportes` y la doble identidad Dataflow/reporte. El catálogo visible de `/reportes` proviene directamente de los Dataflows del tenant Qlik activo; PostgreSQL conserva únicamente configuración, workers personales e historial autosuficiente de ejecuciones.

El modelo mental final es: diseñar un Dataflow en Qlik → aparece automáticamente en Reportes → ejecutar → descargar.

## 1. Principios centrales

- Qlik Cloud es la fuente de verdad del catálogo actual de reportes.
- Cada Dataflow del tenant activo es un reporte; no existe una fila PostgreSQL equivalente.
- La identidad operativa de un reporte es `tenantQlikId + flujoIdQlik`.
- Las URLs de producto usan `flujoIdQlik`; el tenant se deriva de la sesión autenticada.
- Cada ejecución vuelve a leer `scripts/current`; nunca reutiliza SQL compilado de otra corrida.
- PostgreSQL persiste historia de ejecución, no el catálogo actual de Dataflows.
- El worker personal sigue siendo único por `usuario + tenant Qlik` y se crea solo al ejecutar por primera vez.
- La plantilla Automate base nunca se ejecuta ni se modifica como worker.
- El frontend no envía IDs de worker, usuario, tenant, organización, SQL ni GCS para ejecutar.
- El catálogo actual y la historia pueden divergir: borrar un Dataflow de Qlik lo quita de `/reportes`, pero no elimina ejecuciones ni descargas históricas.

## 2. Arquitectura objetivo

```text
Qlik Cloud
└── Dataflows actuales
    └── /reportes y /reportes/:flujoId

PostgreSQL
├── automatizaciones_personales_qlik
├── ejecuciones_reportes
├── usuarios / organizaciones / tenants
└── configuración Qlik, BigQuery y GCS

Runtime
Dataflow → compilador → worker personal → Talend → BigQuery → GCS
```

## 3. Catálogo y rutas de producto

`/reportes` es la única experiencia de usuario para descubrir y ejecutar Dataflows. Debe conservar la UI actual del listado de reportes: búsqueda, filtro por espacio, paginación, acción Ejecutar y acceso a detalle.

`GET /api/reportes` consulta los Dataflows visibles en el tenant Qlik activo y admite `q` y `espacioId`. No consulta PostgreSQL para decidir qué reportes existen.

Cada elemento devuelve como mínimo `id`, `nombre`, `espacioId`, `espacioNombre`, descripción y metadata temporal disponible. `id` es el ID real del Dataflow Qlik.

La URL canónica de detalle es `/reportes/:flujoId`. El backend valida que el `flujoId` esté presente entre los Dataflows accesibles mediante el cliente Qlik de la sesión actual. Conocer un ID de otro tenant no concede acceso.

Las rutas web legacy quedan temporalmente como redirects con `replace`:

```text
/flujos → /reportes
/flujos/:id → /reportes/:id
```

`Dataflows` desaparece de la navegación principal. El término Dataflow sigue usándose en Configuración y detalles técnicos donde describe correctamente infraestructura Qlik.

## 4. Crear un reporte

Crear un reporte significa copiar el Dataflow base configurado en Qlik, no insertar una fila local.

La UI conserva un botón `Crear reporte` que abre el modal basado en la funcionalidad actual de `ModalCrearDataflowDesdePlantilla`.

La API objetivo es:

```text
GET  /api/reportes/plantilla-base
POST /api/reportes/desde-plantilla
```

El flujo de creación es: obtener plantilla del tenant → validar que siga disponible en Qlik → copiar Dataflow con el nombre indicado → devolver el nuevo ID Qlik → abrirlo o enlazarlo en Qlik Cloud. Al volver a `/reportes`, el nuevo Dataflow aparece automáticamente.

No existe `/reportes/nueva`, `POST /api/reportes` para persistencia local, ni un estado local pendiente/activo del reporte. Si falta la plantilla base, la UI informa que el entorno requiere configuración administrativa y no crea recursos alternativos.

## 5. Detalle de reporte

`/reportes/:flujoId` fusiona la UX útil del detalle actual de Reportes con `/flujos/:id`.

El encabezado muestra nombre actual del Dataflow, espacio, enlace `Ver en Qlik Cloud` y `Ejecutar reporte`. No muestra Clonar reporte local, editar reporte local, activar/desactivar, automatización vinculada ni crear automatización.

La vista se organiza en tres secciones o pestañas:

1. `Diseño y validación`.
2. `Detalles`.
3. `Historial`.

`Diseño y validación` reutiliza la lectura/resumen actual de `scripts/current` y la combina con el preflight real del compilador. Presenta fuentes, filtros, joins, campos, rango temporal, advertencias, incompatibilidades, bytes procesados, costo BigQuery estimado y SHA-256 cuando corresponda.

`Detalles` reutiliza la metadata del Dataflow: ID Qlik, espacio, descripción, última modificación, tipo y enlace a Qlik Cloud.

`Historial` lista ejecuciones persistidas para `organizacion + tenant + flujoId` y prioriza estado, usuario, fecha, error y acceso a descarga. Los detalles técnicos ampliados quedan disponibles para administración/auditoría.

## 6. API canónica de reportes

La superficie pública de producto queda deliberadamente pequeña:

```text
GET  /api/reportes
GET  /api/reportes/plantilla-base
POST /api/reportes/desde-plantilla
GET  /api/reportes/:flujoId
GET  /api/reportes/:flujoId/resumen
GET  /api/reportes/:flujoId/preflight
GET  /api/reportes/:flujoId/ejecuciones
POST /api/reportes/:flujoId/ejecuciones
```

Desaparecen de la API de producto:

```text
POST /api/reportes                 # creación de fila local
PUT  /api/reportes/:id
PUT  /api/reportes/:id/configuracion
POST /api/reportes/:id/clonar
GET  /api/reportes/:id/configuracion
GET  /api/reportes/:id/ejecuciones-locales
```

La ruta de preflight actual `/api/reportes/dataflows/:flujoId/preflight` se simplifica a `/api/reportes/:flujoId/preflight`.

Los endpoints `/api/flujos` pueden mantenerse temporalmente como aliases internos durante la migración, pero ningún frontend nuevo debe depender de ellos. Una vez movidos todos los consumidores, se eliminan o quedan únicamente redirects web, no una segunda superficie de producto.

## 7. Ejecución directa

`POST /api/reportes/:flujoId/ejecuciones` no recibe body de infraestructura. El servidor deriva organización, tenant, usuario e identidad Qlik desde la sesión autenticada.

La secuencia es:

```text
resolver sesión
→ resolver cliente Qlik del tenant activo
→ comprobar que flujoId existe y es accesible
→ snapshot de nombre y espacio
→ leer scripts/current
→ SHA-256 + parser + IR + compilador
→ validar compatibilidad y BigQuery
→ construir cuatro queries Talend
→ resolver o crear worker personal(usuario, tenant)
→ crear ejecución autosuficiente en PostgreSQL
→ lock corto del worker
→ GET workspace
→ validar/inyectar cuatro queries
→ PUT workspace
→ POST run
→ persistir runId
→ UNLOCK
→ Talend → BigQuery → GCS
```

No existe búsqueda previa de `reporteId` local ni una validación de estado de una fila `reportes`.

## 8. Worker personal y concurrencia

El modelo `automatizaciones_personales_qlik` se conserva. Sigue existiendo como máximo un worker vigente por `usuario + tenant Qlik` mediante `UNIQUE(usuario_id, tenant_qlik_id)`.

Abrir el catálogo, abrir un detalle, consultar metadata o ejecutar preflight no crea workers. El worker se crea únicamente al primer `Ejecutar` del usuario en ese tenant y se reutiliza para cualquier Dataflow posterior.

La plantilla base sigue validándose estrictamente contra `Credenciales`, `BqSelectData`, `BqNumberCsv`, `BqExportData`, `BqDrop` y `executeTask`. No se auto-repara una plantilla o worker modificado manualmente.

Un worker referenciado que devuelve Qlik `404` puede recrearse desde una plantilla válida bajo el lock de creación. Un worker existente pero estructuralmente incompatible falla cerrado con `WORKER_INCOMPATIBLE` y requiere recreación administrativa explícita.

El lock de ejecución sigue cubriendo únicamente `GET/validar workspace → PUT workspace → POST run`. Se libera inmediatamente después de crear el run; Talend puede continuar mientras se lanza otra ejecución posterior.

## 9. Modelo de datos objetivo

Se elimina completamente la tabla `reportes` una vez migradas sus referencias históricas.

`ejecuciones_reportes` deja de tener `reporte_id` y pasa a ser autosuficiente. Como mínimo conserva/añade:

```text
id
organizacion_id
tenant_qlik_id
flujo_id_qlik
flujo_nombre_snapshot
flujo_espacio_id_qlik nullable
ejecutado_por_usuario_id nullable para legado
automatizacion_personal_id nullable
automatizacion_id_qlik
run_id_qlik nullable
hash_dataflow_sha256
script_dataflow
sql_bigquery_compilado
script_exportacion
uri_base_gcs
estado
version_compilador
etapa_error / mensaje_error
iniciado_en / finalizado_en / creado_en / actualizado_en
```

Los snapshots de nombre/espacio representan cómo se veía el Dataflow al iniciar esa ejecución. Renombrar o mover posteriormente el Dataflow en Qlik no reescribe historia.

Se añade un índice orientado al historial por Dataflow, equivalente a `(organizacion_id, tenant_qlik_id, flujo_id_qlik, creado_en)`, además de los índices existentes útiles por ejecutor y `run_id_qlik`.

`organizacion_id` y `tenant_qlik_id` se persisten intencionalmente en la ejecución aunque exista relación entre tenant y organización: la fila histórica debe ser autosuficiente para autorización, descargas y auditoría sin depender de que exista un catálogo local de reportes.

## 10. Migración preservadora

La migración se añade hacia adelante; no reescribe `0005` ni migraciones ya aplicadas.

Antes de borrar `reportes`, cada ejecución existente debe recibir contexto desde su reporte actual:

```text
ejecuciones_reportes.organizacion_id      ← reportes.organizacion_id
ejecuciones_reportes.tenant_qlik_id       ← reportes.tenant_qlik_id
ejecuciones_reportes.flujo_nombre_snapshot ← reportes.flujo_nombre_snapshot
ejecuciones_reportes.flujo_espacio_id_qlik ← reportes.flujo_espacio_id_qlik
```

`flujo_id_qlik` ya existe en las ejecuciones y debe conservarse. Si existe una discrepancia entre el snapshot de ejecución y la fila `reportes`, la migración no debe inventar un tercer valor: se preserva el `flujo_id_qlik` ya auditado en la ejecución y solo se usa `reportes` para completar contexto ausente.

Después del backfill se verifica que ninguna ejecución quede sin `organizacion_id`, `tenant_qlik_id` o `flujo_nombre_snapshot`. Recién entonces se elimina la FK y columna `reporte_id` y finalmente la tabla `reportes`.

La migración no crea workers personales, no adopta Automates antiguos y no elimina recursos en Qlik. Los workers vigentes de `automatizaciones_personales_qlik` permanecen intactos.

Las ejecuciones históricas sin `ejecutado_por_usuario_id` siguen siendo válidas y solo son visibles a administradores según la spec de descargas privadas.

## 11. Historial y sincronización

`GET /api/reportes/:flujoId/ejecuciones` filtra directamente por organización, tenant y `flujo_id_qlik`; no requiere que exista una fila local ni un worker vigente.

La sincronización de estados pendientes debe operar sobre las propias ejecuciones y sus snapshots `automatizacion_id_qlik` / `run_id_qlik`. Recrear el worker personal no cambia qué Automate/run se consulta para una ejecución histórica.

El estado Qlik `finished` continúa sin significar que el reporte esté completo: solo el marcador GCS `__finalizado__-*` autoriza transición local a completada. `failed`/`stopped` pueden seguir sincronizándose desde Qlik cuando corresponda.

## 12. Descargas

`/descargas` deja de hacer JOIN con `reportes`. Consulta directamente `ejecuciones_reportes` usando `organizacion_id`, `tenant_qlik_id`, `ejecutado_por_usuario_id`, `flujo_nombre_snapshot`, estado y `uri_base_gcs`.

Usuario final:

```text
organizacion_id = organización de sesión
tenant_qlik_id = tenant activo
ejecutado_por_usuario_id = usuario de sesión
```

Administrador: mismo scope de organización/tenant sin restringir a un ejecutor específico.

El nombre visible de una descarga es `flujo_nombre_snapshot`; no se consulta Qlik para reconstruirlo. Un Dataflow eliminado o renombrado no rompe descargas históricas.

Se conservan `parte-*.csv.gz`, marcador `__finalizado__-*`, streaming por chunks, progreso por bytes, signed URLs V4 y validación de bucket/prefijo.

## 13. URI GCS y snapshots de ejecución

La URI de una ejecución usa el nombre actual del Dataflow en el momento de lanzar el reporte:

```text
<gcs-base>/usuarios/<usuarioId>/<slug-flujo>/<ejecucionId>/
```

Renombrar el Dataflow posteriormente no mueve archivos ni altera la auditoría.

Cada ejecución nueva debe guardar antes del run, como mínimo, usuario ejecutor, organización, tenant, ID/nombre/espacio del Dataflow, worker lógico, Automate Qlik exacto, hash, script actual, SQL compilado, cuatro queries Talend serializadas y URI GCS.

Si Qlik crea el run pero falla la persistencia local posterior, el error debe conservar el `runIdQlik` conocido y la etapa `persistir-run`, igual que en el diseño de workers ya implementado.

## 14. UX del listado

Se conserva el estilo visual de `ListaReportes`, no la semántica de la entidad anterior.

Las columnas objetivo son equivalentes a:

```text
Reporte | Espacio | Última actualización | Acciones
```

Cada fila tiene `Ejecutar reporte` y `Ver detalle`. El listado no ejecuta preflight N veces al cargar; eso evita N lecturas de script y N dry-runs BigQuery.

El estado local `Disponible/Inactivo` deja de existir como propiedad del reporte. Si se necesita una señal ligera en el listado, debe provenir de metadata Qlik ya disponible, no de una fila PostgreSQL ni de preflight masivo.

La barra se renombra conceptualmente a `BarraFiltrosReportes`, conserva búsqueda/filtro por espacio/contador y cambia el CTA a `Crear reporte` desde plantilla Qlik.

## 15. UX del detalle

El detalle conserva un único encabezado con nombre actual, espacio, `Ver en Qlik Cloud` y `Ejecutar reporte`.

`Diseño y validación` reutiliza la experiencia de `PestanaScriptFlujo` y la complementa con `PreflightDataflow`: resumen entendible, filtros, campos, advertencias, incompatibilidades, fuentes, joins, bytes/costo y hash.

`Detalles` reutiliza la experiencia de `PestanaMetadataFlujo` para ID Qlik, espacio, fecha de modificación, descripción y tipo.

`Historial` reutiliza `HistorialAuditoriaReporte`, pero su identidad pasa de `reporteId` a `flujoIdQlik`. El usuario normal ve estado/fecha/usuario/descarga/error; administración puede expandir worker, Automate, runId, hash, SQL, queries Talend, GCS y tiempos.

Desaparecen `ConfiguracionDataflowReporte`, `PestanaAutomatizacionFlujo`, asociación por nombre con Automates, botón `Clonar reporte`, edición local y activación/desactivación.

## 16. Navegación y transición frontend

La navegación principal queda:

```text
Inicio
Reportes
Descargas
Configuración   # solo según permisos actuales
```

Se retira el item `Dataflows` de `NAVEGACION`. `/flujos` y `/flujos/:id` solo redirigen a sus equivalentes `/reportes` mientras existan enlaces guardados.

Los componentes útiles del módulo `flujos` pueden moverse al módulo `reportes` durante la implementación. El objetivo no es un rename masivo, sino que el dominio final no mantenga dos páginas para el mismo recurso.

Los consumidores administrativos que necesitan listar Dataflows para seleccionar una plantilla pueden seguir usando un servicio/puerto Qlik específico; retirar `/flujos` como producto no elimina el concepto técnico Dataflow de Configuración.

## 17. Contratos

Desaparecen contratos orientados a CRUD local como `CrearReporte`, `ActualizarConfiguracionReporte` y `ConfiguracionReporteDataflow`.

`ResumenReporte` y `DetalleReporte` pasan a representar metadata del Dataflow Qlik, no una fila PostgreSQL. No contienen `creadoPorUsuarioId`, `activa` ni `destinoGcs` como propiedades del catálogo.

`DetalleEjecucionReporte` elimina `reporteId` y añade los snapshots necesarios de contexto: organización/tenant si forman parte del contrato administrativo, `flujoNombreSnapshot` y `flujoEspacioIdQlik`. `automatizacionIdQlik` y `automatizacionPersonalId` permanecen solo como auditoría de ejecución.

Los contratos de ejecución aceptan `flujoIdQlik` como identidad del recurso. IDs de usuario/tenant/worker nunca forman parte del body confiable del cliente.

## 18. Manejo de errores

- `DATAFLOW_NO_ENCONTRADO`: el ID no está disponible en el tenant activo; devolver 404 y no buscar un reporte local alternativo.
- `DATAFLOW_NO_COMPATIBLE`: mostrar operaciones no soportadas y no iniciar Talend.
- BigQuery no configurado/inválido: bloquear ejecución con mensaje accionable de entorno.
- `SIN_AUTOMATIZACION_BASE`: indicar que el entorno no está preparado; no usar la plantilla directamente como worker.
- `PLANTILLA_INCOMPATIBLE`: bloquear creación de workers y reservar detalles estructurales para administración.
- `WORKER_INCOMPATIBLE`: no sobrescribir silenciosamente; permitir recreación administrativa desde plantilla.
- fallo antes de `POST run`: la ejecución queda en error con etapa; el usuario no debe creer que Talend inició.
- fallo posterior de Talend/GCS: preservar snapshots y mantener `/descargas` incompleta hasta marcador final.

No existen fallbacks que creen una fila `reportes`, tomen un worker ajeno o reutilicen SQL histórico.

## 19. Pruebas requeridas

La implementación seguirá TDD. La matriz mínima incluye:

- `GET /api/reportes` lista Dataflows Qlik del tenant y no consulta tabla `reportes`.
- búsqueda y filtro por espacio conservan comportamiento del catálogo.
- IDs de otro tenant no son accesibles por conocer la URL.
- `Crear reporte` copia únicamente el Dataflow base y no inserta PostgreSQL.
- `/reportes/nueva` deja de ser flujo de creación local.
- detalle combina metadata Qlik, resumen, preflight e historial por `flujoId`.
- ejecutar desde listado y detalle llama al mismo endpoint por `flujoId`.
- primer ejecutar crea un worker; siguientes Dataflows reutilizan el mismo worker del usuario/tenant.
- dos usuarios o dos tenants mantienen workers separados.
- lock corto evita cruces de workspace y se libera tras `POST run`.
- cada ejecución nueva guarda snapshots de organización, tenant, Dataflow, usuario, worker, Automate, run, hash, script, SQL y GCS.
- migración hace backfill completo antes de eliminar `reporte_id` y `reportes`.
- una ejecución histórica conserva nombre/espacio aunque el Dataflow se renombre o elimine.
- `/descargas` funciona sin JOIN a `reportes` y mantiene privacidad por usuario.
- sincronización usa `automatizacion_id_qlik`/`run_id_qlik` históricos, no el worker vigente.
- `/flujos` y `/flujos/:id` redirigen sin quedar en navegación principal.
- no quedan consumidores productivos de CRUD local de reportes ni asociación Dataflow→Automate por nombre.

## 20. Fuera de alcance

- Ejecutar Qlik Dataflow como motor de datos; sigue siendo diseñador visual.
- Reemplazar Qlik Automate o Talend.
- Crear pools de workers o múltiples workers por usuario para aumentar concurrencia.
- Borrar automáticamente Automates legacy del tenant.
- Reparar bloques individuales de plantillas/workers incompatibles.
- Reintroducir schedules/cron, SFTP u otros destinos.
- Ejecutar preflight de todos los Dataflows al abrir el catálogo.
- Mantener una tabla/cache local de Dataflows solo para preservar la entidad `reportes`.
- Implementar cancelación real de Talend.

## 21. Criterios de aceptación

La arquitectura se considera implementada cuando:

1. `/reportes` lista directamente Dataflows Qlik del tenant activo con la UI actual de reportes.
2. `/reportes/:flujoId` fusiona metadata, diseño/resumen, preflight, ejecución e historial.
3. Crear reporte copia únicamente el Dataflow base; no crea una fila PostgreSQL.
4. La tabla `reportes` y la columna `ejecuciones_reportes.reporte_id` desaparecen mediante migración preservadora.
5. `ejecuciones_reportes` contiene scope y snapshots suficientes para autorización, historial y Descargas sin JOIN al catálogo.
6. La ejecución recibe un `flujoIdQlik`, relee `scripts/current`, compila y usa el worker personal del usuario actual.
7. Sigue existiendo como máximo un worker vigente por `usuario + tenant`, creado perezosamente y reutilizado entre Dataflows.
8. La concurrencia conserva el lock corto `workspace → run` y no bloquea toda la duración de Talend.
9. `/descargas` mantiene privacidad por usuario y funciona aunque el Dataflow o worker actuales cambien o desaparezcan.
10. `Dataflows` desaparece de la navegación; `/flujos` queda solo como redirect temporal y ningún frontend nuevo depende de su API.
11. El contrato Talend de cuatro queries, GZIP, límite de 1.000.000 y `__finalizado__` permanece intacto.
12. Tests, typecheck, Biome, build y `git diff --check` quedan verdes, y la migración se prueba sobre PostgreSQL efímero antes de aplicarla a una base persistente.
