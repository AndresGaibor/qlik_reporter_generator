# Dataflow de Qlik como reporte ejecutable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que cada Dataflow Qlik sea directamente un reporte ejecutable, eliminar el catálogo PostgreSQL duplicado y conservar workers personales, historial, descargas privadas y runtime Talend/BigQuery/GCS.

**Architecture:** Qlik Cloud pasa a ser la fuente de verdad del catálogo `/reportes`. PostgreSQL conserva `automatizaciones_personales_qlik` y una `ejecuciones_reportes` autosuficiente con snapshots de organización, tenant, Dataflow, usuario, worker, SQL y GCS. La ejecución entra por `flujoIdQlik` y reutiliza el worker personal ya implementado.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM/PostgreSQL, React, TanStack Query/Router, Zod, Vitest/Bun test, Biome.

**Spec:** `docs/superpowers/specs/2026-08-19-dataflow-como-reporte-design.md`

## Global Constraints

- Modificar únicamente `qlik_reportes_creator`.
- No alterar ni perder los cambios locales del favicon en `main`; implementar en worktree aislado.
- No reescribir migraciones `0000`–`0005`; crear una migración `0006` hacia adelante.
- Probar `0006` primero en PostgreSQL 16 efímero y solo después aplicarla a la BD local persistente.
- Qlik Dataflow sigue siendo diseñador visual; cada ejecución relee `scripts/current`.
- Conservar worker único por `usuario + tenant`, creación perezosa y lock corto `workspace → run`.
- Conservar `Credenciales`, `BqSelectData`, `BqNumberCsv`, `BqExportData`, `BqDrop`.
- Conservar CSV GZIP, `|`, máximo 1.000.000 filas y marcador `__finalizado__-*`.
- No reintroducir SFTP, cron/schedules, edición de workspace ni cancelación falsa mediante stop Qlik.
- Validar por bloques grandes; no repetir suites completas después de cada microcambio.

---
### Task 1: Contratos, esquema y migración autosuficiente de ejecuciones

**Files:**
- Modify: `packages/contratos/src/reportes/dataflow.ts`
- Modify/Test: `packages/contratos/src/reportes/dataflow.test.ts`
- Modify: `apps/api/src/plataforma/persistencia/esquema.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/puertos/puerto-repositorio-reportes.ts`
- Modify: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.ts`
- Modify/Test: `apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
- Create: `apps/api/drizzle/0006_*` + snapshot/journal correspondiente.

**Interfaces:**
- `ResumenReporte`/`DetalleReporte` representan metadata Qlik (`id`, `nombre`, `espacioId`, `espacioNombre`, `modificadoEn`).
- `CrearEjecucionReportePersistida` recibe `organizacionId`, `tenantQlikId`, `flujoIdQlik`, `flujoNombreSnapshot`, `flujoEspacioIdQlik` y ya no recibe `reporteId`.
- `listarEjecuciones(flujoIdQlik, tenantQlikId, organizacionId, limite?)` reemplaza el lookup por UUID local.

- [ ] **Step 1: Escribir RED de contratos sin CRUD local**

```ts
expect(esquemaResumenReporte.parse({
  id: "df-1", nombre: "Ventas", espacioId: "sp-1",
  espacioNombre: "Comercial", modificadoEn: "2026-08-19T00:00:00.000Z",
})).not.toHaveProperty("activa");
expect(esquemaDetalleEjecucionReporte.safeParse({
  id: crypto.randomUUID(), reporteId: crypto.randomUUID(), flujoIdQlik: "df-1",
})).success).toBe(false);
```

Eliminar `CrearReporte`, `ActualizarConfiguracionReporte` y `ConfiguracionReporteDataflow`; mantener preflight y estado de ejecución.

- [ ] **Step 2: Escribir RED del repositorio autosuficiente**

Probar que `crearEjecucion` persiste `organizacionId`, `tenantQlikId`, `flujoNombreSnapshot` y no `reporteId`; que historial/descargas filtran directamente por columnas de `ejecuciones_reportes` y no llaman `innerJoin(reportes, ...)`.

Run: `bun test packages/contratos/src/reportes/dataflow.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts`
Expected: FAIL por contratos/esquema actuales.

- [ ] **Step 3: Cambiar esquema Drizzle y repositorio**

En `ejecucionesReportes`, añadir FKs/snapshots:

```ts
organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
tenantQlikId: uuid("tenant_qlik_id").notNull().references(() => tenantsQlik.id),
flujoNombreSnapshot: text("flujo_nombre_snapshot").notNull(),
flujoEspacioIdQlik: text("flujo_espacio_id_qlik"),
```

Eliminar `reporteId` y la tabla `reportes` del esquema final. Crear índice `(organizacionId, tenantQlikId, flujoIdQlik, creadoEn)`. En el puerto/repo eliminar `crearReporte`, `obtenerPorId`, `listar`, `actualizarReporte`, `clonarReporte`; mantener solo operaciones de ejecuciones/descargas con scope propio.

- [ ] **Step 4: Crear migración `0006` preservadora**

La migración debe: añadir columnas nullable → hacer `UPDATE ... FROM reportes WHERE e.reporte_id=r.id` → verificar/backfill → `SET NOT NULL` para organización/tenant/nombre → añadir FKs/índices → eliminar FK/índice/columna `reporte_id` → `DROP TABLE reportes`.

No usar un `DROP TABLE reportes` antes del `UPDATE`. No modificar `automatizaciones_personales_qlik`.

- [ ] **Step 5: Verificar bloque persistencia**

Run: `bun test packages/contratos/src/reportes/dataflow.test.ts apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts && bun run --cwd packages/contratos typecheck && bun run --cwd apps/api typecheck && git diff --check`
Expected: PASS.

- [ ] **Step 6: Commit del bloque**

```bash
git add packages/contratos apps/api/src/plataforma/persistencia apps/api/src/modulos/reportes/aplicacion/puertos apps/api/src/modulos/reportes/infraestructura apps/api/drizzle
git commit -m "refactor: persistir ejecuciones por dataflow"
```

### Task 2: API `/reportes` y ejecución directa por Dataflow

**Files:**
- Modify: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.ts`
- Modify/Test: `apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts`
- Modify: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.ts`
- Modify/Test: `apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
- Modify/Test: `apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts`
- Modify: `apps/api/src/app.ts`
- Reuse: `apps/api/src/modulos/flujos/aplicacion/casos-de-uso/listar-flujos.ts`
- Reuse: `apps/api/src/modulos/flujos/aplicacion/resumir-dataflow.ts`

**Interfaces:**
- `EntradaEjecutarReporte` usa `flujoIdQlik`, `tenantId`, `organizacionId`, `usuarioId`, `usuarioIdQlik`; elimina `reporteId`.
- `GET /api/reportes` devuelve Dataflows Qlik filtrables.
- `POST /api/reportes/:flujoId/ejecuciones` ejecuta ese Dataflow directamente.

- [ ] **Step 1: Escribir RED de catálogo/detalle/preflight/ejecución por `flujoId`**

Cubrir:

```ts
GET  /api/reportes?q=ventas&espacioId=sp-1
GET  /api/reportes/df-1
GET  /api/reportes/df-1/resumen
GET  /api/reportes/df-1/preflight
GET  /api/reportes/df-1/ejecuciones
POST /api/reportes/df-1/ejecuciones
```

Afirmar que `GET /api/reportes` usa Qlik/consulta de flujos y no `repositorioReportes.listar`; que un ID no accesible en el tenant devuelve `DATAFLOW_NO_ENCONTRADO`; y que el POST entrega `flujoIdQlik: "df-1"` al caso de uso.

Run: `bun test apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts`
Expected: FAIL por API basada todavía en UUID local.

- [ ] **Step 2: Reescribir `EjecutarReporte` para resolver el Dataflow actual**

El caso debe localizar el Dataflow en `qlik.listarFlujos()`, tomar `name`/`spaceId`, ejecutar `prepararDataflowActual(qlik, flujoIdQlik, alcanceBigQuery)`, resolver el worker personal y crear auditoría con:

```ts
{
  id: ejecucionReporteId,
  organizacionId: entrada.organizacionId,
  tenantQlikId: entrada.tenantId,
  flujoIdQlik: flujo.id,
  flujoNombreSnapshot: flujo.name,
  flujoEspacioIdQlik: flujo.spaceId ?? null,
  ejecutadoPorUsuarioId: entrada.usuarioId,
  automatizacionPersonalId: worker.id,
  automatizacionIdQlik: worker.automatizacionIdQlik,
  // hash/script/sql/queries/GCS actuales
}
```

`construirUriEjecucion` usa `flujo.name`; worker/lock/etapas `obtener-workspace`, `actualizar-workspace`, `crear-run`, `persistir-run` se mantienen.

- [ ] **Step 3: Convertir rutas de `/reportes` en fachada Qlik**

Mover/reutilizar lógica de `/api/flujos`: listado, plantilla base, copia desde plantilla y resumen. Eliminar handlers de `POST /`, `PUT`, `/clonar`, `/configuracion` y `/ejecuciones-locales`. Cambiar preflight a `/:flujoId/preflight`.

- [ ] **Step 4: Ajustar composition root**

En `app.ts`, inyectar `ConsultaFlujosQlik(await resolverQlik(c))` o dependencia equivalente a rutas de reportes. Mantener `/api/flujos` temporalmente para consumidores técnicos/admin, pero el producto nuevo no depende de él.

- [ ] **Step 5: Verificar bloque backend operativo**

Run: `bun test apps/api/src/modulos/reportes/http/rutas-reportes-dataflow.test.ts apps/api/src/modulos/reportes/aplicacion/ejecutar-reporte.test.ts apps/api/src/modulos/reportes/aplicacion/integracion-pipeline-dataflow.test.ts apps/api/src/app.test.ts && bun run --cwd apps/api typecheck && git diff --check`
Expected: PASS.

- [ ] **Step 6: Commit del bloque**

```bash
git add apps/api/src/modulos/reportes apps/api/src/app.ts apps/api/src/app.test.ts
git commit -m "feat: ejecutar dataflows directamente como reportes"
```

### Task 3: Historial, sincronización y Descargas sin JOIN a `reportes`

**Files:**
- Modify/Test: `apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts`
- Modify/Test: `apps/api/src/modulos/descargas/aplicacion/servicio-descargas.ts`
- Modify/Test: `apps/api/src/modulos/descargas/http/rutas-descargas.test.ts`
- Modify: `packages/contratos/src/descargas/*` si el DTO aún expone `reporteId`.
- Modify/Test: pruebas del repositorio ya creadas en Task 1 solo si aparece un gap de query.

**Interfaces:**
- Historial se identifica por `(organizacionId, tenantQlikId, flujoIdQlik)`.
- `ResumenEjecucionDescarga` elimina `reporteId`; `reporteNombre` se obtiene de `flujoNombreSnapshot`.
- Privacidad sigue usando `ejecutadoPorUsuarioId` y scope org/tenant.

- [ ] **Step 1: Escribir RED de historial/descargas autosuficientes**

Afirmar que una ejecución histórica con `flujoNombreSnapshot: "Ventas antiguas"` y `automatizacionIdQlik: "auto-viejo"` sigue listándose/descargándose aunque no exista una fila `reportes` ni se consulte el worker actual.

Afirmar que usuario normal recibe solo filas con `ejecutadoPorUsuarioId = sesión.usuarioId`, mientras administración obtiene todas dentro de org/tenant.

- [ ] **Step 2: Adaptar sincronización a snapshots de ejecución**

Agrupar/sincronizar pendientes por `automatizacionIdQlik` almacenado en cada ejecución; no resolver worker vigente ni catálogo Qlik actual. Mantener `__finalizado__-*` como autoridad para completada.

- [ ] **Step 3: Adaptar `ServicioDescargas` y DTOs**

Mapear:

```ts
{
  id: e.id,
  creadoPorUsuarioId: e.creadoPorUsuarioId,
  reporteNombre: e.reporteNombre, // flujo_nombre_snapshot
  automatizacionIdQlik: e.automatizacionIdQlik,
  estado: e.estado,
  ...
}
```

Eliminar cualquier requisito/serialización de `reporteId` en contratos de descargas si ya no es necesario.

- [ ] **Step 4: Verificar bloque historial/descargas**

Run: `bun test apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.test.ts apps/api/src/modulos/descargas apps/api/src/modulos/reportes/infraestructura/repositorio-reportes-postgres.test.ts && bun run --cwd packages/contratos typecheck && bun run --cwd apps/api typecheck && git diff --check`
Expected: PASS.

- [ ] **Step 5: Commit del bloque**

```bash
git add apps/api/src/modulos/descargas apps/api/src/modulos/reportes/aplicacion/sincronizar-ejecuciones-reporte.ts packages/contratos/src/descargas
git commit -m "refactor: desacoplar historial y descargas del catalogo local"
```

### Task 4: Unificar UI en `/reportes` y convertir `/flujos` en redirects

**Files:**
- Modify: `apps/web/src/modulos/reportes/api.ts`
- Modify/Test: `apps/web/src/modulos/reportes/pagina-reportes.tsx`, `pagina-reportes.test.tsx`
- Modify/Test: `apps/web/src/modulos/reportes/pagina-detalle-reporte.tsx`, `pagina-detalle-reporte.test.tsx`
- Modify: `apps/web/src/modulos/reportes/componentes/lista-reportes.tsx`
- Rename/Modify: `barra-filtros-automatizaciones.tsx` → `barra-filtros-reportes.tsx`
- Reuse/move: `apps/web/src/modulos/flujos/componentes/detalle/pestana-script-flujo.tsx`
- Reuse/move: `apps/web/src/modulos/flujos/componentes/detalle/pestana-metadata-flujo.tsx`
- Reuse/move: `modal-crear-dataflow-desde-plantilla.tsx` como modal Crear reporte.
- Modify: `apps/web/src/modulos/reportes/rutas.tsx`, `apps/web/src/modulos/flujos/rutas.tsx`, `apps/web/src/app/navegacion.ts`.

**Interfaces:**
- `obtenerReportes()` llama `/reportes`; resultado son Dataflows Qlik.
- `obtenerReporte(flujoId)`, `obtenerResumenReporte(flujoId)`, `preflightDataflowReporte(flujoId)`, `obtenerEjecucionesReporte(flujoId)`, `ejecutarReporte(flujoId)` usan la API canónica.
- Crear reporte usa `/reportes/plantilla-base` y `/reportes/desde-plantilla`.

- [ ] **Step 1: Escribir RED de catálogo visual basado en Dataflows**

Probar que `/reportes` muestra `nombre`, `espacioNombre` y `modificadoEn`; conserva búsqueda/filtro/paginación; `Ejecutar reporte` usa el ID Qlik; y no renderiza `activa`, creador local ni nombre Dataflow duplicado.

Probar también el CTA `Crear reporte` sin navegar a `/reportes/nueva`.

- [ ] **Step 2: Migrar API web y listado**

Eliminar helpers `crearReporte`, `actualizarReporte`, `clonarReporte`, `obtenerConfiguracionReporte`. Cambiar preflight a `/reportes/:flujoId/preflight`. El listado usa una sola consulta de reportes/Dataflows y obtiene espacios desde esos mismos resultados o desde el endpoint técnico existente cuando sea necesario.

Actualizar columnas a:

```text
Reporte | Espacio | Última actualización | Acciones
```

No lanzar preflight por cada fila.

- [ ] **Step 3: Integrar Crear reporte desde plantilla Qlik**

Reutilizar la UX de `ModalCrearDataflowDesdePlantilla`: nombre → `POST /reportes/desde-plantilla` → nuevo ID Qlik → ofrecer/abrir en Qlik Cloud e invalidar `reportes`. No crear `/reportes/nueva` ni formulario local.

- [ ] **Step 4: Fusionar detalle**

`PaginaDetalleReporte` carga en paralelo metadata, resumen, preflight e historial por `flujoId`. Quitar Clonar/editar/activo. Incorporar `PestanaScriptFlujo` + `PestanaMetadataFlujo` como `Diseño y validación`, `Detalles`, `Historial`; mantener `Ejecutar reporte` y `Ver en Qlik Cloud`.

- [ ] **Step 5: Navegación y redirects**

Quitar `{ to: "/flujos", etiqueta: "Dataflows" }` de navegación. `crearRutasFlujos` pasa a redirects con `replace` hacia `/reportes` y `/reportes/$id`; eliminar las páginas producto antiguas cuando ya no tengan consumidores.

- [ ] **Step 6: Verificar bloque frontend**

Run: `bun run --cwd apps/web test:run -- src/modulos/reportes src/modulos/flujos src/app/navegacion.test.ts && bun run --cwd apps/web typecheck && bunx biome check apps/web/src/modulos/reportes apps/web/src/modulos/flujos apps/web/src/app && git diff --check`
Expected: PASS.

- [ ] **Step 7: Commit del bloque**

```bash
git add apps/web/src/modulos/reportes apps/web/src/modulos/flujos apps/web/src/app
git commit -m "feat: unificar dataflows y reportes en la misma experiencia"
```

### Task 5: Limpieza, migración efímera, aplicación local y regresión integral

**Files:**
- Delete: casos de uso backend de CRUD local (`crear-reporte.ts`, `clonar-reporte.ts`) y tests sin consumidores.
- Delete: componentes web locales obsoletos (`pagina-nuevo-reporte`, `configuracion-dataflow-reporte`, `pestana-automatizacion-flujo`) cuando el scan confirme 0 consumidores.
- Modify: guards arquitectónicos existentes (`arquitectura-task9.test.ts` u otro guard enfocado).
- Verify: `apps/api/drizzle/0006_*` sobre PostgreSQL efímero.

**Interfaces:**
- Ningún código productivo usa tabla `reportes`, `reporteId` local, CRUD local ni asociación Dataflow→Automate por nombre.
- `/api/flujos` puede sobrevivir solo si un consumidor técnico/admin real lo necesita; `/flujos` web no aparece como producto.

- [ ] **Step 1: Añadir guards RED contra residuos de arquitectura anterior**

Escanear código productivo y fallar si aparecen referencias funcionales a:

```text
crearReporte( / actualizarReporte( / clonarReporte(
reporteId como identidad de producto
from(reportes) / innerJoin(reportes
/reportes/nueva
NAVEGACION ... /flujos
```

Permitir menciones históricas únicamente en migraciones/specs/tests que validan su eliminación.

- [ ] **Step 2: Eliminar código muerto confirmado**

Antes de borrar cada archivo, ejecutar `rg` de imports/consumidores. Mantener `modulos/flujos` backend/API técnico si Configuración todavía necesita listar/copiar Dataflows; eliminar solo páginas/acciones de producto duplicadas.

- [ ] **Step 3: Probar migración `0006` en PostgreSQL 16 efímero**

Crear contenedor temporal, aplicar `0000`–`0005`, sembrar al menos un reporte y una ejecución con usuario/Automate/GCS, aplicar `0006` y afirmar:

```text
reportes table = absent
ejecuciones count = unchanged
organizacion_id/tenant_qlik_id preserved
flujo_id_qlik/nombre/espacio preserved
automatizacion_id_qlik/run/GCS preserved
automatizaciones_personales count unchanged
reporte_id column = absent
```

Destruir el contenedor al finalizar incluso si falla una assertion.

- [ ] **Step 4: Ejecutar una validación integral única**

Run: `bun run verify && git diff --check`
Expected: backend, web, contratos, lint, typecheck y build PASS.

- [ ] **Step 5: Aplicar `0006` a la BD local solo después del PASS efímero**

Run: `bun run --cwd apps/api db:migrate`
Después consultar `information_schema` para confirmar `reportes` ausente y `ejecuciones_reportes` con snapshots nuevos, preservando conteo de ejecuciones.

- [ ] **Step 6: Smoke test local de rutas sin ejecutar Talend**

Con `bun run dev` ya disponible o mediante tests de Hono, comprobar 200/redirect de `GET /api/reportes`, detalle de un Dataflow existente y redirects `/flujos`; no lanzar un reporte real automáticamente durante smoke.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "refactor: eliminar catalogo local de reportes"
```

## Parallel Execution Strategy

- Task 1 es prerequisito estructural y se ejecuta sola.
- Tras Task 1, Task 2 (API/ejecución) y Task 3 (historial/descargas) pueden ejecutarse en paralelo con subagentes frescos porque consumen el mismo puerto ya estabilizado y trabajan principalmente en archivos distintos.
- Task 4 comienza cuando las APIs de Tasks 2 y 3 estén verdes; un subagente frontend puede trabajar sin tocar migraciones/backend salvo ajustes contractuales explícitos.
- Task 5 es el único gate integral: reúne limpieza, prueba PostgreSQL efímera y `bun run verify` completo.
- Las reviews se agrupan por bloque: una revisión conjunta tras Tasks 1–3 y otra tras Tasks 4–5, salvo que aparezca un fallo Critical que obligue a aislarlo.
